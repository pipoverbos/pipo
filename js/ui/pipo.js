// Pipo, la mascota: SVG en línea con varios estados de ánimo (normal, happy, cheer, think, hurt, dead).
// El dibujo de Pipo no entra en la licencia MIT del código: todos los derechos reservados (ver README).

const INK = "#2B2140";
export function pipo(m) {
  m = m || "normal";
  var dead = m === "dead",
    eyes,
    mouth,
    ex = "";
  var st = 'stroke="' + INK + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  function eye(x, y, dx, dy) {
    return (
      '<circle cx="' +
      x +
      '" cy="' +
      y +
      '" r="6" fill="' +
      INK +
      '"/><circle cx="' +
      (x + 2 + (dx || 0)) +
      '" cy="' +
      (y - 2 + (dy || 0)) +
      '" r="2" fill="#fff"/>'
    );
  }
  if (dead) {
    eyes = '<path d="M38 66l14 14M52 66L38 80M68 66l14 14M82 66L68 80" ' + st + "/>";
    mouth = '<path d="M50 96h20" ' + st + "/>";
    ex = '<ellipse cx="60" cy="8" rx="20" ry="5" fill="none" stroke="#F2C230" stroke-width="4"/>';
  } else if (m === "happy" || m === "cheer") {
    eyes = '<path d="M38 76Q46 64 54 76M66 76Q74 64 82 76" ' + st + "/>";
    mouth =
      '<path d="M46 88Q60 110 74 88Z" fill="#8A2F40" stroke="' + INK + '" stroke-width="3.5" stroke-linejoin="round"/>';
    if (m === "cheer")
      ex =
        '<path d="M108 56l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#FFF08A" stroke="' +
        INK +
        '" stroke-width="2.5" stroke-linejoin="round"/><path d="M12 62l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#8EDCF2" stroke="' +
        INK +
        '" stroke-width="2.5" stroke-linejoin="round"/>';
  } else if (m === "hurt") {
    eyes = '<g class="eyes">' + eye(46, 74) + eye(74, 74) + '</g><path d="M36 62l18 5M84 62l-18 5" ' + st + "/>";
    mouth = '<path d="M50 96q5-6 10 0t10 0" ' + st + "/>";
    ex =
      '<path d="M100 50q7 11 0 16q-7-5 0-16z" fill="#8EDCF2" stroke="' +
      INK +
      '" stroke-width="2.5" stroke-linejoin="round"/>';
  } else if (m === "think") {
    eyes = '<g class="eyes">' + eye(46, 74, 2, -2) + eye(74, 74, 2, -2) + "</g>";
    mouth = '<path d="M54 92h14" ' + st + "/>";
    ex = '<circle cx="106" cy="60" r="3" fill="' + INK + '"/><circle cx="112" cy="50" r="4" fill="' + INK + '"/>';
  } else {
    eyes = '<g class="eyes">' + eye(46, 74) + eye(74, 74) + "</g>";
    mouth = '<path d="M48 90Q60 101 72 90" ' + st + "/>";
  }
  var body = dead ? "#CFCBD8" : "#FFC24B",
    feet = dead ? "#B9B5C5" : "#E9A223";
  return (
    '<div class="pipo m-' +
    m +
    '"><svg viewBox="0 0 120 134" role="img" aria-label="Pipo, la mascota">' +
    '<ellipse cx="60" cy="127" rx="30" ry="5" fill="rgba(0,0,0,.14)"/>' +
    '<ellipse cx="42" cy="119" rx="13" ry="7" fill="' +
    feet +
    '" stroke="' +
    INK +
    '" stroke-width="3"/>' +
    '<ellipse cx="78" cy="119" rx="13" ry="7" fill="' +
    feet +
    '" stroke="' +
    INK +
    '" stroke-width="3"/>' +
    '<circle cx="60" cy="78" r="42" fill="' +
    body +
    '" stroke="' +
    INK +
    '" stroke-width="3.5"/>' +
    (dead
      ? ""
      : '<ellipse cx="42" cy="62" rx="10" ry="6" fill="#FFE08F" transform="rotate(-30 42 62)"/><circle cx="36" cy="88" r="6" fill="#FF8FA3" opacity=".7"/><circle cx="84" cy="88" r="6" fill="#FF8FA3" opacity=".7"/>') +
    '<path d="M38 36V52Q60 62 82 52V36" fill="#6446C0" stroke="' +
    INK +
    '" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<polygon points="60,10 104,28 60,46 16,28" fill="#7B5CD6" stroke="' +
    INK +
    '" stroke-width="3.5" stroke-linejoin="round"/>' +
    '<path d="M100 30V52" stroke="#F2C230" stroke-width="3.5" stroke-linecap="round"/><circle cx="100" cy="56" r="4.5" fill="#F2C230" stroke="' +
    INK +
    '" stroke-width="2"/>' +
    eyes +
    mouth +
    ex +
    "</svg></div>"
  );
}
