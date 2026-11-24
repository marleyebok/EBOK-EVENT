/* =========================================================
   EBOK — EXPORTS DE LISTES (CSV, Excel, PDF)
   ---------------------------------------------------------
   Fabrique les fichiers dans le navigateur, sans bibliothèque ni serveur :
   - CSV  : séparateur « ; » et BOM, pour qu'Excel en français l'ouvre tel quel ;
   - XLSX : un vrai classeur Excel (archive ZIP non compressée + XML) ;
   - PDF  : un document A4 paysage, tableau paginé, en Helvetica.
   Utilisé par le tableau de bord organisateur (js/organisateur.js).
   ========================================================= */
(function(){
  const telecharger = (blob, nom)=>{
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
  };
  const texte = v=> v == null ? '' : String(v);

  /* ---------------- CSV ---------------- */
  function csv(nom, entetes, lignes){
    const cell = v=> `"${texte(v).replace(/"/g, '""')}"`;
    const corps = '﻿' + [entetes, ...lignes].map(l=> l.map(cell).join(';')).join('\r\n');
    telecharger(new Blob([corps], { type: 'text/csv;charset=utf-8' }), nom + '.csv');
  }

  /* ---------------- ZIP (sans compression) ---------------- */
  const TABLE_CRC = (()=>{ const t = new Uint32Array(256); for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = octets=>{ let c = 0xFFFFFFFF; for(const b of octets) c = TABLE_CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(fichiers){
    const enc = new TextEncoder(), morceaux = [], central = [];
    let decalage = 0;
    const u16 = n=> [n & 255, (n >>> 8) & 255], u32 = n=> [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for(const [chemin, contenu] of fichiers){
      const nom = enc.encode(chemin), data = enc.encode(contenu), crc = crc32(data);
      const entete = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nom.length), ...u16(0)]);
      morceaux.push(entete, nom, data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nom.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(decalage)]), nom);
      decalage += entete.length + nom.length + data.length;
    }
    const tailleCentral = central.reduce((s, x)=> s + x.length, 0);
    const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(fichiers.length), ...u16(fichiers.length), ...u32(tailleCentral), ...u32(decalage), ...u16(0)]);
    return new Blob([...morceaux, ...central, fin]);
  }

  /* ---------------- XLSX ---------------- */
  const xml = s=> texte(s).replace(/[&<>"]/g, c=> ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colonne = i=>{ let s = ''; i++; while(i){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function xlsx(nom, entetes, lignes, feuille){
    const largeurs = entetes.map((h, i)=> Math.min(60, Math.max(10, texte(h).length + 2, ...lignes.map(l=> texte(l[i]).length + 2))));
    const ligne = (vals, r, gras)=> `<row r="${r}">${vals.map((v, c)=>{
      const ref = colonne(c) + r;
      return typeof v === 'number' && isFinite(v)
        ? `<c r="${ref}"${gras ? ' s="1"' : ''}><v>${v}</v></c>`
        : `<c r="${ref}" t="inlineStr"${gras ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')}</row>`;
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${largeurs.map((w, i)=> `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${ligne(entetes, 1, true)}${lignes.map((l, i)=> ligne(l, i + 2, false)).join('')}</sheetData><autoFilter ref="A1:${colonne(entetes.length - 1)}${lignes.length + 1}"/></worksheet>`;
    const fichiers = [
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml((feuille || 'Inscrits').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml((feuille || 'Inscrits').slice(0, 31))}'!$A$1:$${colonne(entetes.length - 1)}$${lignes.length + 1}</definedName></definedNames></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECE6DA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ['xl/worksheets/sheet1.xml', sheet],
    ];
    telecharger(new Blob([zip(fichiers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nom + '.xlsx');
  }

  /* ---------------- PDF ---------------- */
  // Caractères hors Latin-1 que l'encodage WinAnsi sait écrire.
  const WINANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'œ': 0x9C, 'Œ': 0x8C, 'Ÿ': 0x9F };
  const versWinAnsi = s=> [...texte(s).replace(/[\r\n\t]+/g, ' ')].map(ch=>{
    const c = ch.codePointAt(0);
    if(c >= 32 && c < 127) return ch;
    if(c >= 0x80 && c <= 0x9F) return ch;   // déjà converti (ex. « … » ajouté par couper())
    if(c >= 0xA0 && c <= 0xFF) return String.fromCharCode(c);
    if(WINANSI[ch]) return String.fromCharCode(WINANSI[ch]);
    return '?';
  }).join('');
  const chainePdf = s=> '(' + [...versWinAnsi(s)].map(ch=>{
    const c = ch.charCodeAt(0);
    if(ch === '(' || ch === ')' || ch === '\\') return '\\' + ch;
    return c > 126 ? '\\' + c.toString(8).padStart(3, '0') : ch;
  }).join('') + ')';
  const largeurTexte = (s, taille, gras)=> versWinAnsi(s).length * taille * (gras ? 0.55 : 0.5);
  const couper = (s, max, taille, gras)=>{
    let t = versWinAnsi(s);
    if(largeurTexte(t, taille, gras) <= max) return t;
    while(t.length > 1 && largeurTexte(t + '\x85', taille, gras) > max) t = t.slice(0, -1);
    return t + '\x85';
  };
  function pdf(nom, titre, sousTitre, entetes, lignes, poids){
    const L = 842, H = 595, M = 32, TAILLE = 8.5, HAUT_LIGNE = 17, HAUT_TETE = 20;
    const total = (poids || entetes.map(()=> 1)).reduce((a, b)=> a + b, 0);
    const larg = (poids || entetes.map(()=> 1)).map(w=> (L - 2 * M) * w / total);
    const xs = larg.reduce((acc, w, i)=> (acc.push(i ? acc[i - 1] + larg[i - 1] : M), acc), []);
    const pages = [];
    const parPage = Math.max(1, Math.floor((H - 2 * M - 56 - HAUT_TETE - 16) / HAUT_LIGNE));
    const nbPages = Math.max(1, Math.ceil(lignes.length / parPage));
    for(let p = 0; p < nbPages; p++){
      let c = '';
      const txt = (x, y, s, gras, taille, gris)=> c += `BT /${gras ? 'F2' : 'F1'} ${taille || TAILLE} Tf ${gris ? '0.42 0.40 0.37 rg' : '0.11 0.10 0.09 rg'} ${x.toFixed(1)} ${y.toFixed(1)} Td ${chainePdf(s)} Tj ET\n`;
      let y = H - M - 14;
      txt(M, y, titre, true, 15);
      y -= 16;
      txt(M, y, sousTitre, false, 9, true);
      y -= 26;
      c += `0.925 0.902 0.855 rg ${M} ${(y - 6).toFixed(1)} ${L - 2 * M} ${HAUT_TETE} re f\n`;
      entetes.forEach((h, i)=> txt(xs[i] + 4, y, couper(h, larg[i] - 8, TAILLE, true), true));
      y -= HAUT_TETE;
      for(const l of lignes.slice(p * parPage, (p + 1) * parPage)){
        l.forEach((v, i)=> txt(xs[i] + 4, y, couper(v, larg[i] - 8, TAILLE, false), false));
        c += `0.86 0.84 0.80 RG 0.5 w ${M} ${(y - 6).toFixed(1)} m ${L - M} ${(y - 6).toFixed(1)} l S\n`;
        y -= HAUT_LIGNE;
      }
      txt(M, M - 12, `EBOK · ${lignes.length} inscrit${lignes.length > 1 ? 's' : ''}`, false, 8, true);
      txt(L - M - 60, M - 12, `Page ${p + 1} / ${nbPages}`, false, 8, true);
      pages.push(c);
    }
    // Objets : 1 catalogue, 2 pages, 3-4 polices, puis (page, contenu) par page.
    const objets = [];
    objets[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objets[2] = `<< /Type /Pages /Kids [${pages.map((_, i)=> `${5 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objets[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objets[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    pages.forEach((c, i)=>{
      objets[5 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${L} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`;
      objets[6 + 2 * i] = `<< /Length ${c.length} >>\nstream\n${c}endstream`;
    });
    let sortie = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const positions = [];
    for(let i = 1; i < objets.length; i++){ positions[i] = sortie.length; sortie += `${i} 0 obj\n${objets[i]}\nendobj\n`; }
    const xref = sortie.length;
    sortie += `xref\n0 ${objets.length}\n0000000000 65535 f \n` + positions.slice(1).map(p=> String(p).padStart(10, '0') + ' 00000 n \n').join('');
    sortie += `trailer\n<< /Size ${objets.length} /Root 1 0 R /Info << /Producer (EBOK) >> >>\nstartxref\n${xref}\n%%EOF`;
    // Chaque caractère vaut un octet (tout est ASCII ou déjà en octal).
    const octets = new Uint8Array(sortie.length);
    for(let i = 0; i < sortie.length; i++) octets[i] = sortie.charCodeAt(i) & 255;
    telecharger(new Blob([octets], { type: 'application/pdf' }), nom + '.pdf');
  }

  window.EBOK_EXPORT = { csv, xlsx, pdf, _zip: zip, _crc32: crc32 };
})();
