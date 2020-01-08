/* XEP-0363: HTTP File Upload
 * Created by: Anish Lushte (github.com/AnishLushte07/)
 * Updated to support v0.9 of the XMPP XEP-0363 standard
 * http://xmpp.org/extensions/xep-0363.html
 *
 */

import { $iq, Strophe } from 'strophe.js';

Strophe.addConnectionPlugin('httpUpload', {
    _c: null,
    url: null,
    init: function (conn) {
        this._c = conn;
        Strophe.addNamespace('HTTP_UPLOAD', 'urn:xmpp:http:upload:0');
    },
    _discover: function (handler_cb, error_cb) {
        if (this.url) return handler_cb();

        var iq = $iq({
            'type': 'get',
            'from': this._c.jid,
            'to': Strophe.getDomainFromJid(this._c.jid),
            'id': this._c.getUniqueId()
        })
            .c('query', {
                'xmlns': Strophe.NS.DISCO_ITEMS
            });

        this._c.sendIQ(
            iq,
            (stanza) => {
                var items = stanza.querySelectorAll('item');
                var uploadUrl = Array.from(items)
                    .map(node => node.getAttribute('jid'))
                    .find(jid => jid.includes('upload'));

                if (!uploadUrl) {
                    return error_cb({ message: 'Could not find upload service.' })
                }

                this.url = uploadUrl;
                handler_cb();
            },
            (err) => error_cb(err)
        );
    },
    _checkMaxSize: function (fileSize, handler_cb, error_cb) {
        var iq = $iq({
            'type': 'get',
            'from': this._c.jid,
            'to': this.url,
            'id': this._c.getUniqueId()
        })
            .c('query', {
                'xmlns': Strophe.NS.DISCO_INFO
            });

        this._c.sendIQ(
            iq,
            (stanza) => {
                var field = stanza.querySelector('field[var="max-file-size"]');
                var maxFileSize = +field.querySelector('value').innerHTML;

                if (fileSize > maxFileSize) {
                    return error_cb({ message: `File larger than ${maxFileSize} bytes` })
                }

                handler_cb();
            },
            (err) => error_cb(err)
        );
    },
    _getSlot: function (file, handler_cb, error_cb) {
        var iq = $iq({
            'type': 'get',
            'from': this._c.jid,
            'to': this.url,
            'id': this._c.getUniqueId()
        })
            .c('request', {
                'xmlns': Strophe.NS.HTTP_UPLOAD,
                'filename': file.name,
                'size': file.size,
                'content-type': file.type
            });

        this._c.sendIQ(
            iq,
            (stanza) => {
                var put = stanza.querySelector('put').getAttribute('url');
                var get = stanza.querySelector('get').getAttribute('url');
                handler_cb({ put, get });
            },
            (err) => {
                const message = err.querySelector('text').innerHTML;
                return error_cb({ message });
            }
        );
    },
    getUrls: function (file, success_cb, error_cb) {
        if (!file || typeof file !== "object") {
            return error_cb({ message: 'Please pass file instance' });
        }

        this._discover(() => {
            this._checkMaxSize(file.size, () => {
                this._getSlot(file, (data) => {
                    success_cb(data);
                }, error_cb);
            }, error_cb);
        }, error_cb);
    },
});
