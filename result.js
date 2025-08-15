$ejb.css = new Set();
$ejb.head = new Set();
$ejb.res += '<!--$EJB-HEAD-REPLACER-->'; $ejb.res += ` `;
$ejb.css.add(
    ((($ejb) => {
        $ejb.res += ` body { color: red; } `;
        ; return $ejb.res
    })({ ...$ejb, res: '' }))
);
$ejb.head.add(`<style>${$ejb.css.values().toArray().join("\n")}</style>`)
$ejb.res = $ejb.res.replace("<!--$EJB-HEAD-REPLACER-->", $ejb.head.values().toArray().join("\n"))
return $ejb;