$ejb.css = new Set();
$ejb.head = new Set();

    const title = 'EJB Test View';
$ejb.res += `
`;
$ejb.css.add(
                (await(async($ejb) => {
        body 
        h1 
    ; return $ejb.res})({...$ejb, res:''}))
            );$ejb.res += `
<!DOCTYPE html>
<html>
<head>
    `;
$ejb.res += '<!--$EJB-HEAD-REPLACER-->';$ejb.res += `
    <title>`;
$ejb.res += $ejb.escapeHtml(title);
$ejb.res += `</title>
        <meta charset="utf-8">
</head>
<body>
    <h1>Hello from EJB Test View!</h1>
</body>
</html>`;

$ejb.head.add($ejb.css.values().toArray().join("\n"))
$ejb.res = $ejb.res.replace("<!--$EJB-HEAD-REPLACER-->", $ejb.head.values().toArray().join("\n"))
return $ejb;