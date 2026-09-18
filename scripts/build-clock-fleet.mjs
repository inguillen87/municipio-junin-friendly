import fs from 'node:fs';
import path from 'node:path';
// Source-owned, unique patch points; failed integration stops the build instead of publishing broken controls.
const patches=[
  ['</head>', '<link rel="stylesheet" href="/assets/clock-fleet-panel.css"><script type="module" src="/assets/clock-fleet-panel.js"></script></head>'],
  [
    "<section id=\"pm10Reception\"",
    "<section id=\"clockFleetReception\" hidden aria-label=\"Central de recepción por equipo\"></section>\n<section id=\"pm10Reception\""
  ],
  [
    "popup.append(title,list,pending,open);return popup",
    "popup.append(title,list,pending,fleetMapInfo(site),open);return popup"
  ],
  [
    "var item=document.createElement('li');var title=document.createElement('strong');title.textContent=site.code",
    "var item=document.createElement('li');item.dataset.siteKey=site.code.toLowerCase();item.tabIndex=-1;var title=document.createElement('strong');title.textContent=site.code"
  ],
  [
    "item.append(title,detail);el.mapAccessibleList.appendChild(item)",
    "item.append(title,detail,fleetMapInfo(site));el.mapAccessibleList.appendChild(item)"
  ],
  [
    "riseOnHover:true});marker.bindTooltip",
    "riseOnHover:true,mcSiteKey:site.code.toLowerCase()});marker.bindTooltip"
  ],
  [
    "state.mapBounds=leaflet.latLngBounds(coordinates);",
    "refreshFleetMap();state.mapBounds=leaflet.latLngBounds(coordinates);"
  ],
  [
    "      function haversineMeters(first,second)",
    "      function fleetMapInfo(site){\n        var note=document.createElement('p');note.className='fleet-map-note';note.dataset.fleetMapNote='true';\n        var entry=state.fleetView&&state.fleetView.sites.find(function(x){return x.key===site.code.toLowerCase()});\n        note.textContent=!state.fleetView?'Recepción por equipo: sin consulta actual.':entry&&entry.receipts>0?formatCount(entry.records)+' registros con acuse · último '+formatInstant(entry.lastReceivedAt)+'. No indica conexión actual.':'Sin acuses asociados a este punto en la consulta actual. La lectura local puede estar pendiente de envío.';\n        return note;\n      }\n      function refreshFleetMap(){\n        if(state.mapMarkers)state.mapMarkers.eachLayer(function(marker){\n          var site=state.reportedSites.find(function(x){return x.code.toLowerCase()===marker.options.mcSiteKey});if(!site)return;\n          marker.bindPopup(reportedPopup(site),{maxWidth:340});var entry=state.fleetView&&state.fleetView.sites.find(function(x){return x.key===marker.options.mcSiteKey});\n          var icon=marker.getElement&&marker.getElement();if(icon)icon.classList.toggle('fleet-received',!!entry&&entry.receipts>0);\n        });\n        Array.from(el.mapAccessibleList.children).forEach(function(item){var site=state.reportedSites.find(function(x){return x.code.toLowerCase()===item.dataset.siteKey});if(!site)return;var old=item.querySelector('[data-fleet-map-note]');if(old)old.replaceWith(fleetMapInfo(site));});\n      }\n      document.addEventListener('mc:clock-fleet-data',function(event){\n        var v=event.detail;if(!v||typeof v.checkedAt!=='string'||!Number.isFinite(Date.parse(v.checkedAt))||!Array.isArray(v.sites)||v.sites.length>200||v.sites.some(function(x){return !/^[a-z0-9][a-z0-9._-]{1,95}$/.test(x.key)||!Number.isSafeInteger(x.records)||x.records<0||!Number.isSafeInteger(x.receipts)||x.receipts<0||x.lastReceivedAt!==null&&!Number.isFinite(Date.parse(x.lastReceivedAt))}))return;\n        state.fleetView=v;refreshFleetMap();\n      });\n      document.addEventListener('mc:clock-fleet-cleared',function(){state.fleetView=null;refreshFleetMap();});\n      document.addEventListener('mc:clock-fleet-map-focus',function(event){\n        var key=event.detail&&event.detail.siteKey;if(typeof key!=='string'||!/^[a-z0-9][a-z0-9._-]{1,95}$/.test(key))return;\n        var site=state.reportedSites.find(function(x){return x.code.toLowerCase()===key});\n        if(!site){showMapFallback('El punto '+key.toUpperCase()+' no tiene coordenadas correlacionadas en este inventario. No se inventó una ubicación.');el.mapAccessibleList.closest('details').open=true;el.mapFallback.scrollIntoView({block:'center'});return;}\n        if(state.map&&state.mapMarkers){state.map.invalidateSize();state.map.setView([site.latitude,site.longitude],16,{animate:false});state.mapMarkers.eachLayer(function(marker){if(marker.options.mcSiteKey===key)marker.openPopup();});el.attendanceMap.scrollIntoView({block:'center'});}\n        var item=Array.from(el.mapAccessibleList.children).find(function(x){return x.dataset.siteKey===key});el.mapAccessibleList.closest('details').open=true;if(item){item.focus({preventScroll:true});if(!state.map)item.scrollIntoView({block:'center'});}\n        setText('mapStatus','Punto '+site.code+' seleccionado. Referencia cartográfica; recepción según el último corte, no conexión actual.');\n      });\n      function haversineMeters(first,second)"
  ]
];
export function patchClockFleetHtml(html){
 if(html.includes('id="clockFleetReception"'))throw Error('Clock fleet installed twice');
 for(const [before,after]of patches){if(html.split(before).length!==2)throw Error('Clock fleet integration point changed: '+before.slice(0,60));html=html.replace(before,()=>after);}
 return html;
}
export function buildClockFleet(root,output){for(const asset of ['attendance-point-label.js','clock-fleet-model.js','clock-fleet-panel.js','clock-fleet-panel.css'])fs.copyFileSync(path.join(root,'assets',asset),path.join(output,'assets',asset));const file=path.join(output,'relojes-marcaciones.html');fs.writeFileSync(file,patchClockFleetHtml(fs.readFileSync(file,'utf8')));}
