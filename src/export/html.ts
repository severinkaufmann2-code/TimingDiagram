/**
 * The diagram as one self-contained web page: the picture, the values table,
 * and the project itself, so the page can be opened in the editor again.
 */

import { decimalsOf, formatNumber } from '../model/numbers';
import { EMBED_ID, serializeForHtml } from '../model/serialize';
import type { Doc } from '../model/types';
import { LIGHT, channelColor } from '../render/theme';
import { channelLabel } from './data';
import type { Picture } from './picture';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PAGE_CSS = `
*{box-sizing:border-box}
body{margin:0;padding:28px 24px 40px;background:#fff;color:#14181f;font:14px/1.45 'IBM Plex Sans','Segoe UI',system-ui,sans-serif}
main{max-width:1500px;margin:0 auto}
h1{margin:0 0 18px;font-size:22px;font-weight:600}
h2{margin:30px 0 10px;font-size:13px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:#4a5361}
.diagram{position:relative;overflow-x:auto}
.diagram svg{display:block;width:100%;min-width:760px;height:auto}
.readout{position:fixed;z-index:2;display:none;padding:8px 10px;background:#14181f;color:#fff;border-radius:6px;font-size:12px;line-height:1.5;pointer-events:none;white-space:nowrap;box-shadow:0 6px 18px rgba(20,24,31,.25)}
.readout b{font-weight:600}
.readout table{border-collapse:collapse;margin-top:2px}
.readout td{padding:0 0 0 10px;border:0;font-family:'IBM Plex Mono',ui-monospace,Consolas,monospace;text-align:right}
.readout td:first-child{padding:0;font-family:inherit;text-align:left}
.readout i{display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:2px}
.values{overflow-x:auto}
.values table{border-collapse:collapse;font-size:13px}
.values th,.values td{padding:6px 12px;border:1px solid #d9dde3;text-align:left;white-space:nowrap}
.values thead th{background:#f7f8fa;font-weight:600}
.values tbody th{font-weight:600}
.values td{font-family:'IBM Plex Mono',ui-monospace,Consolas,monospace}
.values td small{margin-left:8px;font:11px 'IBM Plex Sans','Segoe UI',system-ui,sans-serif;color:#5f6875}
.values td.empty{color:#667080}
.note{max-width:75ch;margin:10px 0 0;font-size:12px;color:#4a5361}
footer{margin-top:28px;font-size:12px;color:#5f6875}
@media print{body{padding:0}.diagram,.values{overflow:visible}.diagram svg{min-width:0}.readout{display:none!important}}
`.trim();

/**
 * Shows the time and every channel's value under the pointer. Kept in plain
 * JavaScript because it runs inside the exported page, without the editor.
 */
const READOUT_SCRIPT = `
(function () {
  var data = JSON.parse(document.getElementById('${EMBED_ID}').textContent);
  var box = document.querySelector('.diagram');
  var svg = box && box.querySelector('svg');
  var geometry = svg && JSON.parse(svg.getAttribute('data-geometry') || 'null');
  if (!svg || !geometry) return;
  var ns = 'http://www.w3.org/2000/svg';
  var cursor = document.createElementNS(ns, 'path');
  cursor.setAttribute('stroke', '#14181f');
  cursor.setAttribute('stroke-width', '1');
  cursor.setAttribute('fill', 'none');
  cursor.style.display = 'none';
  svg.appendChild(cursor);
  var readout = document.createElement('div');
  readout.className = 'readout';
  document.body.appendChild(readout);

  function format(n, decimals, keepZeros) {
    var text = Number(n.toPrecision(10)).toFixed(decimals);
    return decimals > 0 && !keepZeros ? text.replace(/0+$/, '').replace(/\\.$/, '') : text;
  }
  function valueAt(channel, time) {
    var level = channel.initial, anchor = data.time.start;
    for (var i = 0; i < data.points.length; i++) {
      var point = data.points[i], cell = channel.cells[point.id];
      if (!cell) continue;
      if (time < point.time) {
        if (cell.mode === 'ramp' && time > anchor) {
          return level + (cell.value - level) * (time - anchor) / (point.time - anchor);
        }
        return level;
      }
      level = cell.value;
      anchor = point.time;
    }
    return level;
  }
  function hide() {
    cursor.style.display = 'none';
    readout.style.display = 'none';
  }
  function add(parent, tag, text) {
    var element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    parent.appendChild(element);
    return element;
  }
  svg.addEventListener('mousemove', function (event) {
    var rect = svg.getBoundingClientRect();
    var zoom = geometry.width / rect.width;
    var x = (event.clientX - rect.left) * zoom;
    var y = (event.clientY - rect.top) * zoom;
    var time = data.time.start + (x - geometry.x0) / geometry.scale;
    if (time < data.time.start || time > data.time.end || y < geometry.top || y > geometry.bottom) return hide();
    cursor.setAttribute('d', 'M' + (Math.round(x) + 0.5) + ' ' + geometry.top + 'V' + geometry.bottom);
    cursor.style.display = '';
    readout.textContent = '';
    add(readout, 'b', format(time, geometry.decimals, true) + (data.time.unit ? ' ' + data.time.unit : ''));
    var table = add(readout, 'table');
    data.channels.forEach(function (channel, index) {
      var analog = channel.kind === 'analog';
      var row = add(table, 'tr');
      var name = add(row, 'td');
      add(name, 'i').style.background = geometry.colors[index];
      name.appendChild(document.createTextNode(channel.name));
      add(row, 'td', format(valueAt(channel, time), analog ? geometry.valueDecimals[index] : 2) + (analog && channel.unit ? ' ' + channel.unit : ''));
    });
    readout.style.display = 'block';
    var left = event.clientX + 16, top = event.clientY + 16;
    if (left + readout.offsetWidth > window.innerWidth - 8) left = event.clientX - readout.offsetWidth - 16;
    if (top + readout.offsetHeight > window.innerHeight - 8) top = event.clientY - readout.offsetHeight - 16;
    readout.style.left = Math.max(8, left) + 'px';
    readout.style.top = Math.max(8, top) + 'px';
  });
  svg.addEventListener('mouseleave', hide);
})();
`.trim();

function valuesTable(doc: Doc): string {
  const minDecimals = doc.time.snap > 0 ? Math.min(6, decimalsOf(doc.time.snap)) : 0;
  const unit = doc.time.unit.trim();
  const head = doc.points
    .map((point) => `<th scope="col">${escapeHtml(formatNumber(point.time, minDecimals))}${unit ? ` ${escapeHtml(unit)}` : ''}</th>`)
    .join('');
  const body = doc.channels
    .map((channel) => {
      const cells = doc.points
        .map((point) => {
          const cell = channel.cells[point.id];
          if (!cell) return '<td class="empty">–</td>';
          return `<td>${escapeHtml(formatNumber(cell.value))}<small>${cell.mode}</small></td>`;
        })
        .join('');
      return `<tr><th scope="row">${escapeHtml(channelLabel(channel))}</th><td>${escapeHtml(formatNumber(channel.initial))}</td>${cells}</tr>`;
    })
    .join('\n');
  return `<table>
<thead><tr><th scope="col">Channel</th><th scope="col">Initial value</th>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>`;
}

export function buildHtml(doc: Doc, picture: Picture, fontCss: string, exportedOn: Date = new Date()): string {
  const title = doc.title.trim() || 'Timing diagram';
  const date = `${exportedOn.getFullYear()}-${String(exportedOn.getMonth() + 1).padStart(2, '0')}-${String(exportedOn.getDate()).padStart(2, '0')}`;
  const details = {
    width: picture.width,
    ...picture.plot,
    colors: doc.channels.map((channel) => channelColor(LIGHT, channel.color)),
    decimals: Math.max(2, decimalsOf(doc.time.snap)),
    valueDecimals: doc.channels.map((channel) => Math.min(6, decimalsOf((channel.max - channel.min) / 1000))),
  };
  // the readout needs to know where the timeline sits inside the picture
  const svg = picture.svg.replace('<svg ', `<svg data-geometry="${escapeHtml(JSON.stringify(details))}" `);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Timing Diagram">
<title>${escapeHtml(title)}</title>
<style>
${fontCss}
${PAGE_CSS}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<div class="diagram">
${svg}
</div>
<h2>Values</h2>
<div class="values">
${valuesTable(doc)}
</div>
<p class="note">Each column is a transition point. <b>step</b>: the channel keeps its previous value up to that point, then jumps. <b>ramp</b>: the channel changes gradually from its previous value. An empty cell means the channel does not change at that point.</p>
<footer>Exported on ${date}. This page contains the diagram itself and can be opened in the Timing Diagram editor to continue editing.</footer>
</main>
<script type="application/json" id="${EMBED_ID}">${serializeForHtml(doc)}</script>
<script>
${READOUT_SCRIPT}
</script>
</body>
</html>
`;
}
