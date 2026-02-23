// src/services/pdfService.ts — Invoice PDF generator
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { DeliveryDoc, ClientDoc } from './firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const COMPANY = {
  name:    'PlaquistePro SAS',
  address: '12 Avenue des Artisans, 69001 Lyon',
  phone:   '04 72 00 00 00',
  email:   'contact@plaquistepro.fr',
  siret:   '123 456 789 00012',
  logo:    '', // base64 or URL
};

export async function generateInvoicePDF(
  delivery: DeliveryDoc,
  client: ClientDoc
): Promise<void> {
  const date     = format(delivery.deliveredAt?.toDate() || new Date(), 'dd MMMM yyyy', { locale: fr });
  const ref      = delivery.reference;
  const subtotal = delivery.items.reduce((s, i) => s + (i.qty * (i.unitPrice || 0)), 0);
  const vat      = subtotal * (delivery.vatRate || 0.2);
  const total    = subtotal + vat;

  const itemRows = delivery.items.map(i => `
    <tr>
      <td>${i.name}</td>
      <td class="c">${i.ref || '—'}</td>
      <td class="c">${i.qty} ${i.unit}</td>
      <td class="r">${(i.unitPrice || 0).toFixed(2)} €</td>
      <td class="r">${((i.qty * (i.unitPrice || 0))).toFixed(2)} €</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Helvetica Neue',sans-serif; font-size:11px; color:#1a1a2e; background:#fff; padding:40px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; }
  .logo-block h1 { font-size:28px; font-weight:800; color:#1d4ed8; letter-spacing:-1px; }
  .logo-block p  { color:#64748b; font-size:11px; margin-top:2px; }
  .company-info  { text-align:right; color:#64748b; line-height:1.8; }
  .doc-title     { font-size:22px; font-weight:700; color:#1a1a2e; margin-bottom:24px; }
  .meta-grid     { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:32px; }
  .meta-box      { background:#f8fafc; border-radius:8px; padding:16px; }
  .meta-box h3   { font-size:10px; font-weight:700; color:#64748b; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; }
  .meta-box p    { color:#1a1a2e; line-height:1.7; }
  table          { width:100%; border-collapse:collapse; margin-bottom:24px; }
  thead tr       { background:#1d4ed8; color:#fff; }
  thead th       { padding:10px 12px; font-size:10px; letter-spacing:.5px; text-transform:uppercase; text-align:left; }
  tbody tr       { border-bottom:1px solid #f1f5f9; }
  tbody tr:hover { background:#f8fafc; }
  td             { padding:10px 12px; }
  .c             { text-align:center; }
  .r             { text-align:right; font-family:monospace; }
  .totals        { margin-left:auto; width:260px; }
  .total-row     { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f1f5f9; }
  .total-row.main{ font-size:16px; font-weight:700; color:#1d4ed8; border-top:2px solid #1d4ed8; padding-top:10px; margin-top:4px; border-bottom:none; }
  .badge         { display:inline-block; background:#dcfce7; color:#166534; border-radius:20px; padding:4px 12px; font-size:10px; font-weight:700; }
  .sig-section   { margin-top:32px; display:flex; justify-content:space-between; align-items:flex-end; }
  .sig-box       { border:1px solid #e2e8f0; border-radius:8px; padding:12px; width:220px; text-align:center; }
  .sig-box img   { max-width:100%; max-height:80px; }
  .sig-box p     { font-size:10px; color:#64748b; margin-top:6px; }
  .footer        { margin-top:40px; padding-top:16px; border-top:1px solid #e2e8f0; text-align:center; color:#94a3b8; font-size:10px; }
  .status-badge  { display:inline-block; padding:6px 14px; border-radius:20px; font-size:11px; font-weight:700; background:#dcfce7; color:#166534; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo-block">
      ${COMPANY.logo ? `<img src="${COMPANY.logo}" height="50" style="margin-bottom:8px">` : ''}
      <h1>${COMPANY.name}</h1>
      <p>${COMPANY.address}</p>
      <p>${COMPANY.phone} · ${COMPANY.email}</p>
      <p>SIRET: ${COMPANY.siret}</p>
    </div>
    <div class="company-info">
      <strong style="font-size:14px;color:#1a1a2e">BON DE LIVRAISON</strong><br>
      Référence: <strong>${ref}</strong><br>
      Date: <strong>${date}</strong><br>
      <span class="status-badge">✓ LIVRÉ</span>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h3>Client</h3>
      <p><strong>${client.companyName}</strong><br>
      ${client.contactName}<br>
      ${client.address}<br>
      ${client.phone}<br>
      ${client.siret ? 'SIRET: '+client.siret : ''}</p>
    </div>
    <div class="meta-box">
      <h3>Détails livraison</h3>
      <p>
        <strong>Adresse:</strong> ${delivery.address}<br>
        <strong>Chauffeur:</strong> ${delivery.driverName || '—'}<br>
        <strong>Planifié:</strong> ${delivery.scheduledAt ? format(delivery.scheduledAt.toDate(),'dd/MM/yyyy HH:mm') : '—'}<br>
        <strong>Livré le:</strong> ${date}
      </p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Désignation</th>
        <th class="c">Référence</th>
        <th class="c">Quantité</th>
        <th class="r">P.U. HT</th>
        <th class="r">Total HT</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Sous-total HT</span><span>${subtotal.toFixed(2)} €</span></div>
    <div class="total-row"><span>TVA (${((delivery.vatRate||0.2)*100).toFixed(0)}%)</span><span>${vat.toFixed(2)} €</span></div>
    <div class="total-row main"><span>TOTAL TTC</span><span>${total.toFixed(2)} €</span></div>
  </div>

  ${delivery.signature ? `
  <div class="sig-section">
    <div>
      ${delivery.photos?.length ? '<p style="font-size:10px;color:#64748b">'+delivery.photos.length+' photo(s) de preuve disponibles</p>' : ''}
    </div>
    <div class="sig-box">
      <img src="${delivery.signature}" alt="Signature">
      <p>Signature du destinataire</p>
    </div>
  </div>` : ''}

  ${delivery.notes ? `<div style="margin-top:20px;background:#f8fafc;border-radius:8px;padding:14px"><strong>Notes:</strong> ${delivery.notes}</div>` : ''}

  <div class="footer">
    ${COMPANY.name} · ${COMPANY.address} · SIRET ${COMPANY.siret}<br>
    Document généré le ${format(new Date(),'dd/MM/yyyy à HH:mm')}
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Bon de livraison ${ref}`,
    UTI: 'com.adobe.pdf',
  });
}
