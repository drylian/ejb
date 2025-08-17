
                return function(it) {
                    const $ejb = {
                        ins: this,
                        res: '',
                        escapeHtml: function escapeHtml(value) {
  if (value === null || value === void 0)
    return "";
  return String(value).replace(ESPACE_HTML_REGEX, (match) => ESCAPE_HTML[match]);
},
                        escapeJs: (str) => str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${"),
                        EjbFunction:  function() { 
                            return Function.apply(null, arguments);
                        }
                    };
                    
                    $ejb.css = new Set();
$ejb.head = new Set();
$ejb.res += '<!--$EJB-HEAD-REPLACER-->';$ejb.css.add( ( ($ejb) => {$ejb.css.add(
                ((($ejb) => {$ejb.res += `body { color: red; }`;
; return $ejb.res})({...$ejb, res:''}))
            );;return $ejb.res;})({ ...$ejb, res:'' }));
$ejb.head.add(`<style>${$ejb.css.values().toArray().join("\n")}</style>`)
$ejb.res = $ejb.res.replace("<!--$EJB-HEAD-REPLACER-->", $ejb.head.values().toArray().join("\n"))
return $ejb;
                }.bind(this);
            