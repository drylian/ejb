$ejb.css = new Set();
$ejb.head = new Set();

$ejb.head.add(`<style>${$ejb.css.values().toArray().join("\n")}</style>`)
$ejb.res = $ejb.res.replace("<!--$EJB-HEAD-REPLACER-->", $ejb.head.values().toArray().join("\n"))
return $ejb;