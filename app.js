/* =========================================================
   Organograma Inteligente - app.js (FULL)
   - Assistentes abaixo do gestor (somem ao recolher)
   - Pan (horizontal + vertical) com click&drag
   - Zoom no scroll do mouse + slider (70%–150%)
   - Cache (localStorage) para reabrir sem upload
   - Export PDF: 1 página de Sumário + 1 página por Disciplina (nível 2)
   - Cabeçalho com LOGO + paginação
   - Equipes: agrupa por "Equipe" (coluna no colaborador)
   - Equipes do mesmo supervisor: caixas lado a lado (SEM LIMITE, não quebra linha)
========================================================= */

/* ============================
   CONFIG: CABEÇALHO PDF
============================ */
const PDF_HEADER = {
  titlePrefix: "ORGANOGRAMA",
  docCode: "OI-L4-XXX-YYY-01-01",
  revision: "rev.00",
  updatedBy: "Felipe de Jesus",
  approvedBy: "Danilo Rocha",
  date: "" // se vazio, usa data atual pt-BR
};

// (Opcional) mapeamento manual de Disciplina por coordenador (id/nome)
const DISCIPLINA_BY_ID = {};
const DISCIPLINA_BY_NAME = {};

// localStorage keys
const LS_DATA_KEY  = "orgchart:lastData:v5";
const LS_META_KEY  = "orgchart:lastMeta:v5";
const LS_THEME_KEY = "orgchart:theme:v5";
const LS_ZOOM_KEY  = "orgchart:zoom:v5";

let orgData = [];
let currentRoots = [];
let maxDepth = 0;
let countsMap = {};
let LOGO_DATA_URL = null;

/* ============================
   INIT
============================ */
(function init(){
  // theme
  const savedTheme = localStorage.getItem(LS_THEME_KEY);
  if (savedTheme === "dark") document.body.classList.add("dark");
  syncDarkButton();

  // zoom
  const zoomRange = document.getElementById("zoomRange");
  if (zoomRange) {
    const z = parseInt(localStorage.getItem(LS_ZOOM_KEY) || "100", 10);
    zoomRange.value = String(clamp(z, 10, 150));
    applyZoom(zoomRange.value, { persist:false });
    zoomRange.addEventListener("input", () => applyZoom(zoomRange.value));
  }

  // logo
  preloadLogo("logo_sgs.jpg");

  // cache indicator
  const cached = localStorage.getItem(LS_DATA_KEY);
  if (cached) {
    const meta = safeJSON(localStorage.getItem(LS_META_KEY)) || {};
    const box = document.getElementById("cacheBox");
    const metaEl = document.getElementById("cacheMeta");
    if (box && metaEl) {
      metaEl.textContent = meta.when
        ? `Última base: ${meta.name || "arquivo"} • ${meta.when}`
        : "Existe uma base anterior salva no navegador.";
      box.style.display = "flex";
    }
  }

  // drag/drop
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag');
      if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    });
  }

  // pan + wheel zoom
  enablePanAndWheelZoom();
})();

/* ============================
   HELPERS
============================ */
function clamp(v,a,b){ return Math.min(b, Math.max(a,v)); }
function safeJSON(s){ try { return JSON.parse(s); } catch { return null; } }
function normStr(s){ return String(s||"").trim(); }
function stripAccents(s){
  var r = "", str = String(s||"").normalize("NFD");
  for(var i = 0; i < str.length; i++){
    var c = str.charCodeAt(i);
    if(c < 768 || c > 879) r += str[i];
  }
  return r;
}

/* ============================
   LOGO
============================ */
// Logo SGS embutida em base64
const LOGO_SGS_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCABjAMoDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACsyTXoYvEkGimNzPNavdiQY2hVdVIPfOXH5Vp1yF3/AMlZ03/sDXH/AKOhrjxNSVKMXHrKK+Tdjrw9ONRyUukW/uR19FFFdhyBRRRQAUUUUAFFFFABTZJFiRndgiKCWZjgAepp1eJfteeM5/Cfwgube0kMVzq9wlhvU4IjILSY+qoR/wACNAHnXxb/AG0nsr+40vwLbQXCREo2sXalkY9zEnGR/tNwfTFeE6p+0L8SNXlaSbxhqMW452WrLAo+gQCvPOlfS/7Ov7Lml/ETwsnifxPcXQsrl3S0srV/LLKrFS7tjPJBAAx0z3rTREnkdn8d/iJYSiSLxnq5Yc4muDKPyfIr2T4V/tp6tZahBY+OIor/AE+Rgp1O2jEc0P8AtOg4dR3wAfrTf2jP2XdH+H/hF/E/heW6S3tHRbyzuZPNARmCh1Y8jDEAg54OeMV8xUaMD9ZrS6hvrWG5t5Vnt5kWSOVDlXUjIIPcEGuI+Lvxk0P4PaEt7qjNcXk+VtNPhI82dh16/dUcZY9Pc4FcP+xz4pm174ORWtzLvfSbqWzVmPIi4dAfoHx9AK+Q/jf8Qp/iX8StY1Z5WezSVrWyQnhIEJC4HbPLH3apS1Hc7Dxh+138QfE1zJ9gvofDtmT8kFhErOB7yOCSfpge1cU3xu+ILSeYfGmt7s54vHA/LpVT4X/Dy++KXjaw8PWLiBpyXmuGXIhiXl3I7+gHckCvsNP2Kvh6NNFuz6s1ztwbv7Xhy2Pvbdu38MVWiEfOfhP9rH4i+GLhDcasmu2wPzW+pRKxYezrhh+Z+hr6++C3x20T4zaZKbRW0/WLZQbrTZmBZAeN6n+JM8Z7dwOK+F/jH8Lrv4ReN7jQrif7XblFuLW627fNibIBI7MCCCPb0NZ3w08b3Xw58c6R4gtZGQWs6+eoPEkJOJEPsVz+IB7UNXC5+oTusaM7sFRRksxwAPWvlH4uftotY6hcaX4FtoLlYmKPq92pZGI6+UmRkf7TcH0I5PoX7WvjeXwz8G50sZjHNrM0dksiHBETAtIR9VUr/wACr4C6VKQ2z0TVf2h/iRrErPN4v1CHd/BassCj6BAKq2nx2+IllJvi8Z6wT6S3BkH5NkV67+zr+y3pnxE8LJ4n8T3F0LK5d1s7K1fy96qxUu7Yz94EADHTn0q5+0N+yvo/gbwdP4m8Ky3SRWRU3llcyeYDGSBvRiMggkZBzxnpjmtBFX4X/tp63pt/BZ+NYY9U01yFbULaIRzw/wC0yj5XA9gD9elfTcV/bar8S9FvbOZLm0uNCnlimjOVdDLCQQfQivzLr69/Y18UTa29rps7l20ezu4IyTyInlhdR+BLj8K83Hr3If44/wDpSPQwT96f+GX5M+rqKKK7jhCiiigAooooAKKKKACvmv8AbpsZZvh5oN0ikxW+qASEdBuicA/mMfjX0pXM/EnwJZ/ErwTqnh29Plx3keEmAyYpAco4+jAH3GR3poD8uq+5P2OvidpuueAbfwlLOkOtaSXCwMcGaAsWDr643EH0wD3r438a+CtX+H3iO60TW7Vra9tz1x8kq9nQ91PY/h1FZVhf3Ol3sF5ZXEtpdwMHingco6MOhBHINW1ck/UL4heDoviB4L1fw7NcNaRahAYTOiBjHyDkA9elfPH/AAwbpv8A0OF5/wCASf8AxVc98Kv21NQ0sQ6f43tTqVsMKNVtFAnUesidH+q4Psa+s/C3i3R/G2kRapoeowalYydJYGzg+jDqp9iAajVD3PLfDfwwh/Z7+D/jVLTVZdUZra4vllmiEZVxBhRgE91H51+fiDaij0GK/Sz4/wAhi+C3jFl4P9nSD8xivzUqoiZ9R/sIaQsviLxXqhUF4LWG2VscjezMfz2L+VfZFfKH7BQ/0Dxqf+m1p/6DLX1Pd6ha6eqtdXMNsrHCmaQICfbNS9xo+f8A9p34BeJPi94g0S/0F9PRLO1eCb7ZO0ZJLhhjCNnvXi7/ALE3xEZGHn6FyMf8fkn/AMar7f8A+Ej0n/oKWX/gQn+NH/CSaT/0FLL/AMCE/wAaLsLHzZ+2Pod5Z/B7wd5zB20+5iguGQ5BcwMufplT+dfHFfqJ8RvA9j8TfBGp6BePthvYv3c68+XIPmjkHrhgD71+a/jXwVq/w+8R3eia3atbXtu3p8kqdnQ91PY/h1BqoiZ9j/scfE3TNZ8AW/hGSZINZ0kybIHODPCzlw6+uCxBA6YHrXt3jTwzF408JavoU0pgi1G2e2MqqGKbhjcAeuOtflrYX9zpd7DeWVxLaXcDB4p4HKOjDuCOQa+mfhT+2nqGl+Tp/je2bU7YYUaraKBOo9ZE4D/VcH2NDQ7nRf8ADBmm/wDQ43n/AIBJ/wDFV2Hwa+Ctv8FPiI9lb6rNqov9MlmLywiPZtkiXAAJz1r2Lwt4u0fxto8WqaHqEGpWMnSWFs4PdWHVSPQ4NY93/wAlZ03/ALA1x/6OhrzMc3yQ/wAcf/Skd+D+Kf8Ahl+TOvooor0DhCiiigAooooAKKKKACiivM/i98e9D+DV1ptvq9lfXb36O8f2NEIUKQDncw/vUAbnxK+FPh34raP9g16zEjJk293F8s9ux7o38wcg9xXxV8Wv2W/FXw1M99ZRt4h0FMt9rtUPmxL/ANNIxkj/AHlyPXFe7n9ubwWAT/Y+t8f9Mov/AI5Xv3h/WYfEeg6bq1ujxwX9tFdRpIBuVXQMAcd8Gq1Qtz8pAQRkHIrrvhn8UNc+FPiKPVdFuCFJAubNyfJuU/uuP5N1FfSv7Vv7PeljQL7xv4etksLy0/e6jawrtjnjzhpAvRXGcnHUZ79fjyqWoj9CfiJ40sPiP+zP4g1/SyTbXmlyP5bH5o2HDo3upBH4V+e1fTP7ON7PrPwF+LOgktJHbWj3MSehkgkyB9TCPzr5lU5AoWgM+vf2Cj/xL/Gv/Xa0/wDQZauft5AHwt4TyAf9Pl6/9cqxf2Db9VvvGNln52jtp8ewMi/1r6m8ReENE8XQwxa3pVpqsULF40u4VkCMRgkZ6cVL3H0Pyp2If4R+VNkjXy2+UdD2r6J/bN8J6N4S8W+G4NF0u00qGWxleRLSFYw7CQAE4HJr54k/1bfQ1Yj9VfBv/IoaH/14wf8Aotax/iT8KfDvxW0f7Br1kJWTJgu4jtnt2PdG/mDkHuK4vxb8etD+DPhnwfBq9nfXb6hpyPH9jRCFCJGDncw/vCuVP7c3gsAn+x9b4/6ZRf8Axys7MZ4T8Wv2WvFXw1M19Yo3iLQUy32q1Q+bCv8A00j6j/eXI9cV4wCCMg5Ffq5oOsQ+ItD0/VLdXSC9t47iNZANwV1DAHHfBr5o/at/Z70r/hH77xv4etksL60/e6hawriO4jJw0gUdHGcnHUZzzVJ9wsfM/wANPifrvwp8RR6rotwVBIFzZuT5NyndXH8m6ivu7wV430/4jeK/DfiHTCfst5oVw3lt96JxPCGRvdSCK/OSvqT9h6+mm8Qanau5aC3tpXjQ/wAJdod2PrtFefj17kH/AH4/+lI7sF8U/wDDL8mfY9FFFdpxBRRRQAUUjMF6kD603zU/vr+dAD6KZ5qf31/OjzU/vr+dK6HZj6+T/wBvHRZHs/COrKpMMcs9rI3ZSwVl/PY/5V9W+an99fzrlPij4A034peCr/w/fyCJZwHhnXBaCVeUcfQ9u4JHemmkKzPzCIyMV+gX7Nnxf0LxX8N9F0uXUra21vTLdLOeznlCOQg2q6gn5lKgcjp0NfFvxC+E3if4Y6k9rrenSLDuIivoFL2847FXHT6HBHpXHmIt1Qn6rWjsxWZ98/tRfFjQfD3wy1nRI9Qt7rWtWgNpDaQSB3RW4Z2A+6AuevU4FfA1AiK9EI+i16X8LPgB4q+KN9AYLOTS9GJHm6reIUjC99gODI3oBx6kUlZBZnv37EfhUyeAfFd9cxkW2q3ItFJH3kSMhv1kYfhXyR4m8P3HhPxFqei3SlLjT7mS2cH/AGWIB/EYP41+nvg3wtpfgTwxp2g6UoisbKIRpkgsx6szHuSSST6mvCf2mP2bZfiDdnxR4W8n+3QgS7smcILsAYVlY8BwOOeCAOQRylJXCzPn79mb4m2nww+JkN1qcvkaTqELWV1MekWSGRz7BlAJ7BjX6D2mr2GoWqXNre29zbyDck0UqsjD1BBwa/LDWvDuq+G757PVdNutOukODDcwsjfqOfqKoBGVSoVgrdVAOD9abSYan0b+27rOn6v438PLY31tetb2MiTC3lWTy2MgIDYPB9jXzfJ/q2+hp4jK9EI+gq1ZaHqWsExWGnXd9IeAltA0hz+Ap6ILM+mf2v8ARpX8BfDTVlUmGK1NrIwHQvFEy/8Aotq+W+tfpT4j+Hdj8SPhFbeGdVJtmksYNkhHz206oNrYPcHgjuMjvXwP8Q/hL4n+GOpSWutadIINxEV/Ape3mHYq46fQ4I9KUWgsz7P/AGavi/oXin4baLpU2p29trmmW62c9pcShHYINquoP3gVAPHQ5FRftQfFrQvDfw01jRotRt7rWtVhNpDaQyB3VW4d2A+6AuevU4xXwIYi3VCfqtAiK9EI+gosg1Cvqn9iHS7i11m+v5EKwXlvOsJP8XlvCGP0y2PwNeQfC34A+KvijfweRZSaZoxYebqt4hSNV77AcF29AOPUivtbwt4U0zwH4w8OaFpSiOwstBuI03HLMfPiLMx7sxJJ9zXnY9rkh/ij/wClI78EnzT/AMMvyZ6XRTPNT++v50ean99fzrtujisx9FNDqxwGBPsadTEZuueG9M8TW0dvqllFfQxv5ipMMgNgjP5E1if8Kn8H/wDQvWX/AH7rraK5KmDw1aXPUpxk+7SZ1U8ViKUeWnUkl2TaOS/4VP4P/wChesv+/dH/AAqfwf8A9C9Zf9+662isv7OwX/PmP/gK/wAjT6/i/wDn9L/wJ/5nJf8ACp/B/wD0L1l/37o/4VP4P/6F6y/7911tFH9nYL/nzH/wFf5B9fxf/P6X/gT/AMzkv+FT+DyCD4esSD2MdJ/wqTwb/wBC5Yf9+q66ij+z8H/z5j/4Cv8AIPr+L/5/S/8AAn/mcj/wqTwb/wBC5Yf9+qcfhR4QP/MvWX/fFdZRR/Z+D/58x/8AAV/kH1/F/wDP6X/gT/zOS/4VP4P/AOhesv8Av3R/wqfwf/0L1l/37rraKP7OwX/PmP8A4Cv8g+v4v/n9L/wJ/wCZyR+E3g9sZ8O2LY6ZjzSf8Kk8G/8AQuWH/fquuoo/s/B/8+Y/+Ar/ACD6/i/+f0v/AAJ/5nI/8Kk8G/8AQuWH/fqnL8J/B6/d8PWS/SPFdZRR/Z+D/wCfMf8AwFf5B9fxf/P6X/gT/wAzkv8AhU/g/wD6F6y/790H4T+DyMHw9YkehjrraKP7Owf/AD5j/wCAr/IPr+L/AOf0v/An/mcj/wAKk8G/9C5Yf9+qP+FSeDf+hcsP+/VddRR/Z+D/AOfMf/AV/kH1/F/8/pf+BP8AzOT/AOFT+EP+hesv++K5i5+HHhhPiTYWI0S0Fm+lTzNDs+UuJYgG+oDEfjXqdc1caXdP8RrHUVhJso9LngabIwHaWIhcdeQp/KuLF5dheWHJRj8Udora6v027nZhcfieaXPWl8MvtPe2nUr/APCp/B//AEL1l/37o/4VP4P/AOhesv8Av3XW0V2/2dgv+fMf/AV/kcf1/F/8/pf+BP8AzMLRfAugeHLw3emaTbWVyUKGWJcHacZH6Ct2iiuulSp0Y8lKKiuyVjmqValaXNUk2/N3CiiitTIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9k=";

async function preloadLogo(url){
  // Use embedded logo by default
  LOGO_DATA_URL = LOGO_SGS_B64;
}

function handleLogoUpload(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    LOGO_DATA_URL = e.target.result;
    const prev = document.getElementById("logoPreview");
    const lbl  = document.getElementById("logoLabel");
    if(prev) { prev.style.display = "inline-block"; prev.src = LOGO_DATA_URL; }
    if(lbl)  lbl.textContent = "✅ " + file.name;
  };
  reader.readAsDataURL(file);
}

function blobToDataURL(blob){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ============================
   THEME
============================ */
function toggleDarkMode(){
  document.body.classList.toggle("dark");
  localStorage.setItem(LS_THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
  syncDarkButton();
}
function syncDarkButton(){
  const btn = document.getElementById("darkBtn");
  if (!btn) return;
  const isDark = document.body.classList.contains("dark");
  btn.innerHTML = `
    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
    ${isDark ? "Modo claro" : "Modo escuro"}
  `;
}

/* ============================
   ZOOM
============================ */
function applyZoom(value, {persist=true} = {}){
  const v = clamp(parseInt(value,10), 10, 150);
  const pill = document.getElementById("zoomPill");
  if (pill) pill.textContent = v + "%";

  const org = document.getElementById("orgChart");
  if (org) org.style.transform = `scale(${v/100})`;

  if (persist) localStorage.setItem(LS_ZOOM_KEY, String(v));
}

/* ============================
   PAN + WHEEL ZOOM
============================ */
function enablePanAndWheelZoom(){
  const wrap = document.getElementById("chartWrap") || document.querySelector(".chart-wrap");
  if (!wrap || wrap._panBound) return;
  wrap._panBound = true;

  let isDown=false, isDragging=false;
  let sx=0, sy=0, sl=0, st=0, dragDist=0;

  const down=(x,y)=>{
    isDown=true; isDragging=false; dragDist=0;
    wrap.classList.add("dragging");
    sx=x; sy=y; sl=wrap.scrollLeft; st=wrap.scrollTop;
  };
  const move=(x,y)=>{
    if(!isDown) return;
    const dx=x-sx, dy=y-sy;
    dragDist = Math.max(dragDist, Math.abs(dx)+Math.abs(dy));
    if (dragDist>3) isDragging=true;
    wrap.scrollLeft = sl - dx;
    wrap.scrollTop  = st - dy;
  };
  const up=()=>{
    isDown=false;
    wrap.classList.remove("dragging");
  };

  wrap.addEventListener("mousedown",(e)=>{
    if (e.button!==0) return;
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) return;
    down(e.clientX,e.clientY);
  });
  window.addEventListener("mousemove",(e)=> move(e.clientX,e.clientY));
  window.addEventListener("mouseup", up);

  // evita clique involuntário após arrastar
  wrap.addEventListener("click",(e)=>{
    if(isDragging){
      e.preventDefault(); e.stopPropagation();
      isDragging=false;
    }
  }, true);

  // wheel = zoom
  wrap.addEventListener("wheel",(e)=>{
    e.preventDefault();
    const zoomRange = document.getElementById("zoomRange");
    if(!zoomRange) return;

    let z = parseInt(zoomRange.value||"100",10);
    const step = e.deltaY < 0 ? 5 : -5;
    z = clamp(z+step,10,150);
    zoomRange.value = String(z);
    applyZoom(z);
  }, {passive:false});
}

/* ============================
   CACHE
============================ */
function saveCache(fileName="base"){
  localStorage.setItem(LS_DATA_KEY, JSON.stringify(orgData));
  localStorage.setItem(LS_META_KEY, JSON.stringify({
    name:fileName,
    when:new Date().toLocaleString("pt-BR")
  }));
}
function loadCache(){
  const cached = localStorage.getItem(LS_DATA_KEY);
  if(!cached) return alert("Não há cache salvo.");
  try{
    orgData = JSON.parse(cached);
    renderChart({fromCache:true});
  }catch{
    alert("Cache corrompido. Importe novamente.");
  }
}
function clearCache(){
  localStorage.removeItem(LS_DATA_KEY);
  localStorage.removeItem(LS_META_KEY);
  const box=document.getElementById("cacheBox");
  if(box) box.style.display="none";
  alert("Cache limpo.");
}

/* ============================
   IMPORT
============================ */
function handleFile(e){ if(e.target.files[0]) processFile(e.target.files[0]); }

function processFile(file){
  const reader = new FileReader();
  reader.onload = function(ev){
    try{
      let data;
      if(file.name.toLowerCase().endsWith(".csv")){
        data = parseCSV(ev.target.result);
      }else{
        const wb = XLSX.read(ev.target.result, {type:"binary"});
        data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:""});
      }
      orgData = normalizeData(data);

      const errors = validateOrg(orgData);
      showWarnings(errors);

      saveCache(file.name);
      renderChart({fromCache:false});
    }catch(err){
      alert("Erro ao ler arquivo.\nVerifique colunas: Nome, Cargo, Gestor, Tipo, ID, GestorID, Disciplina, Equipe\n\n" + err.message);
      console.error(err);
    }
  };
  if(file.name.toLowerCase().endsWith(".csv")) reader.readAsText(file,"UTF-8");
  else reader.readAsBinaryString(file);
}

function parseCSV(text){
  const lines = text.split("\n").filter(l=>l.trim());
  const headers = lines[0].split(/[,;]/).map(h=>h.trim().replace(/^"|"$/g,""));
  return lines.slice(1).map(line=>{
    const vals=line.split(/[,;]/);
    const obj={};
    headers.forEach((h,i)=> obj[h]=(vals[i]||"").trim().replace(/^"|"$/g,""));
    return obj;
  });
}

function normalizeData(rows){
  return (rows||[]).map((r,idx)=>{
    const keys = Object.keys(r||{});
    const find = (terms)=>{
      const k = keys.find(k=> terms.some(t=> k.toLowerCase().includes(t)));
      return k ? normStr(r[k]) : "";
    };
    const tipo = find(["tipo","type","papel"]).toLowerCase();

    const idRaw = find(["id","matricula","matrícula","chave","codigo","código"]);
    const id = idRaw ? idRaw : `__auto_${idx+1}`;

    const disciplina = find(["disciplina","área","area","setor","frente","frente de trabalho"]);
    const equipe = find(["equipe","nome da equipe","time","grupo","turma"]);

    return {
      id,
      nome: find(["nome","name","colaborador","funcionario","funcionário"]),
      cargo: find(["cargo","role","funcao","função","titulo","título","job"]),
      gestor: find(["gestor","chefe","superior","manager","lider","líder","pai","parent","reporta"]),
      gestorId: find(["gestorid","gestor id","id gestor","manager id","parent id","id_gestor"]),
      disciplina,
      equipe,
      assistente: tipo.includes("assist") || tipo.includes("auxil") || tipo.includes("staff")
    };
  }).filter(r=>r.nome);
}

/* ============================
   VALIDATION
============================ */
function validateOrg(data){
  const errors=[];
  const ids=new Set();
  const nameCount={};

  data.forEach(p=>{
    nameCount[p.nome]=(nameCount[p.nome]||0)+1;
    if(ids.has(p.id)) errors.push(`ID duplicado: "${p.id}"`);
    ids.add(p.id);
  });

  const idMap={}; data.forEach(p=>idMap[p.id]=true);
  const nameMap={}; data.forEach(p=>nameMap[p.nome]=true);

  data.forEach(p=>{
    if(p.assistente && !(p.gestorId || p.gestor)) errors.push(`Assistente "${p.nome}" sem Gestor/GestorID.`);
    if(p.gestorId && !idMap[p.gestorId]) errors.push(`"${p.nome}" GestorID "${p.gestorId}" não existe.`);
    if(!p.gestorId && p.gestor && !nameMap[p.gestor]) errors.push(`"${p.nome}" Gestor "${p.gestor}" não existe.`);
    if(!p.gestorId && p.gestor && nameCount[p.gestor]>1) errors.push(`Gestor "${p.gestor}" duplicado. Use GestorID em "${p.nome}".`);
  });

  return errors;
}

function showWarnings(errors){
  const box=document.getElementById("warnBox");
  const list=document.getElementById("warnList");
  if(!box||!list) return;
  list.innerHTML="";
  if(!errors || !errors.length){ box.style.display="none"; return; }
  errors.slice(0,10).forEach(e=>{
    const li=document.createElement("li");
    li.textContent=e;
    list.appendChild(li);
  });
  box.style.display="block";
}

/* ============================
   TREE + COUNTS
============================ */
function buildTree(data){
  const map={};
  data.forEach(p=> map[p.id]={...p, children:[], assistants:[]});

  const byNameIds={};
  data.forEach(p=>{
    byNameIds[p.nome]=byNameIds[p.nome]||[];
    byNameIds[p.nome].push(p.id);
  });

  const roots=[];
  data.forEach(p=>{
    const node=map[p.id];
    let parentId="";

    if(p.gestorId && map[p.gestorId]) parentId=p.gestorId;
    else if(p.gestor){
      const ids=byNameIds[p.gestor]||[];
      if(ids.length===1) parentId=ids[0];
    }

    if(parentId){
      if(p.assistente) map[parentId].assistants.push(node);
      else map[parentId].children.push(node);
    }else{
      if(!p.assistente) roots.push(node);
    }
  });

  return roots;
}

function computeCounts(roots){
  const m={};
  function walk(n){
    const direct=(n.children?.length||0);
    let total=direct;
    (n.children||[]).forEach(ch=> total += 1 + walk(ch));
    m[n.id]={direct,total};
    return total;
  }
  roots.forEach(r=>walk(r));
  return m;
}

function calcMaxDepth(node,d){
  maxDepth=Math.max(maxDepth,d);
  (node.children||[]).forEach(c=>calcMaxDepth(c,d+1));
}

function getDisciplinaForNode(n){
  if (n.disciplina) return n.disciplina;
  if (DISCIPLINA_BY_ID[n.id]) return DISCIPLINA_BY_ID[n.id];
  if (DISCIPLINA_BY_NAME[n.nome]) return DISCIPLINA_BY_NAME[n.nome];
  return n.nome;
}

/* ============================
   RENDER
============================ */
function renderChart({fromCache=false}={}){
  document.getElementById("uploadSection").style.display="none";
  document.getElementById("chartSection").style.display="block";
  document.getElementById("exportBar").style.display="flex";

  currentRoots = buildTree(orgData);

  maxDepth=0;
  currentRoots.forEach(r=>calcMaxDepth(r,0));
  countsMap = computeCounts(currentRoots);

  const aCount = orgData.filter(p=>p.assistente).length;

  const statusBar = document.getElementById("statusBar");
  if(statusBar){
    statusBar.innerHTML = `
      <div class="stat"><strong>${orgData.length}</strong> pessoas</div>
      <div class="stat"><strong>${orgData.length - aCount}</strong> na hierarquia</div>
      <div class="stat"><strong>${aCount}</strong> assistente${aCount!==1?"s":""}</div>
      <div class="tip">${fromCache ? "📌 Cache reaberto" : "✅ Base carregada"}</div>
    `;
  }

  const levelSel=document.getElementById("levelSelect");
  if(levelSel){
    levelSel.innerHTML='<option value="99">Todos os níveis</option>';
    for(let i=1;i<=maxDepth;i++){
      levelSel.innerHTML += `<option value="${i}">Até nível ${i}</option>`;
    }
  }

  const areaSel=document.getElementById("areaSelect");
  if(areaSel){
    areaSel.innerHTML='<option value="">Todas as áreas</option>';
    const areaNodes = currentRoots.length===1 && currentRoots[0].children.length>0
      ? currentRoots[0].children
      : currentRoots;
    areaNodes.forEach(n=>{
      areaSel.innerHTML += `<option value="${n.id}">${n.nome} (${n.cargo||"—"})</option>`;
    });
  }

  drawChart(currentRoots);
}

function drawChart(roots){
  const chart=document.getElementById("orgChart");
  chart.innerHTML="";

  if(!roots.length){
    chart.innerHTML='<p style="color:red;padding:20px">Nenhuma raiz encontrada.</p>';
    return;
  }

  if(roots.length===1){
    chart.appendChild(renderSubtree(roots[0],0,null));
  }else{
    const row=document.createElement("div");
    row.style.cssText="display:flex;gap:60px;align-items:flex-start;justify-content:center;";
    roots.forEach(r=>row.appendChild(renderSubtree(r,0,null)));
    chart.appendChild(row);
  }
}

function renderSubtree(node, depth, parentNode){
  const wrap=document.createElement("div");
  wrap.style.cssText="display:flex;flex-direction:column;align-items:center;";

  const hasAssistants = node.assistants && node.assistants.length>0;
  const hasChildren   = node.children && node.children.length>0;

  let childrenEl=null, vDown=null, assistantsEl=null;

  const counts = countsMap[node.id] || {direct:0,total:0};
  const tip = [
    `Reporta para: ${parentNode ? parentNode.nome : "Topo"}`,
    `Subordinados: ${counts.direct} diretos / ${counts.total} total`,
    `ID: ${node.id}`
  ].join("\n");

  const card=document.createElement("div");
  card.className="node" + (depth===0 ? " root" : "");
  card.title = tip;
  card.innerHTML = `<div class="node-name">${node.nome}</div><div class="node-role">${node.cargo||"—"}</div>`;

  card.addEventListener("click",(e)=>{
    e.stopPropagation();
    card.scrollIntoView({behavior:"smooth", block:"center", inline:"center"});
    card.classList.add("flash");
    setTimeout(()=>card.classList.remove("flash"),420);
  });

  if(hasChildren || hasAssistants){
    const btn=document.createElement("button");
    btn.className="collapse-btn";
    btn.textContent="−";
    btn.title="Recolher/Expandir";
    btn.addEventListener("click",(e)=>{
      e.stopPropagation();
      const anyVisible =
        (childrenEl && childrenEl.style.display!=="none") ||
        (vDown && vDown.style.display!=="none") ||
        (assistantsEl && assistantsEl.style.display!=="none");

      const val = anyVisible ? "none" : "";
      if(assistantsEl) assistantsEl.style.display = val;
      if(childrenEl) childrenEl.style.display = val;
      if(vDown) vDown.style.display = val;

      btn.textContent = anyVisible ? "+" : "−";
    });
    card.appendChild(btn);
  }

  // Card centered in wrap
  wrap.appendChild(card);

  // Assistants BELOW the card, connected by the vertical spine
  // Each row: [aCard] [dash 28px] [vSeg 2px]  — centered under card
  // The vSeg (rightmost 2px) must align with the card's center axis.
  // We achieve this by centering each aRow in wrap and making vSeg flush-right
  // of the card+dash combination, using a hidden mirror on the right.
  if(hasAssistants){
    assistantsEl = document.createElement("div");
    assistantsEl.className = "assistants-below";
    assistantsEl.style.cssText = "display:flex;flex-direction:column;align-items:center;width:100%;";

    node.assistants.forEach(asst => {
      // aRow: [aCard][dash][vSeg]  all in one flex-row
      // We use a trick: aRow is centered in wrap (align-items:center on wrap)
      // aCard is on the LEFT, vSeg is the 2px RIGHT edge aligned with card center
      // Mirror (hidden) on right keeps centering stable
      const aRow = document.createElement("div");
      aRow.style.cssText = "display:flex;flex-direction:row;align-items:center;";

      const aCard = document.createElement("div");
      aCard.className = "node assistant";
      aCard.title = `Reporta para: ${node.nome}\nID: ${asst.id}`;
      aCard.innerHTML = `<div class="node-name">${asst.nome}</div><div class="node-role">${asst.cargo||"—"}</div>`;
      aCard.addEventListener("click",(e)=>{
        e.stopPropagation();
        aCard.scrollIntoView({behavior:"smooth", block:"center", inline:"center"});
        aCard.classList.add("flash");
        setTimeout(()=>aCard.classList.remove("flash"),420);
      });

      const dash = document.createElement("div");
      dash.style.cssText = "width:28px;border-top:2px dashed var(--asst);flex-shrink:0;";

      // vSeg: continues the vertical spine through the assistant row
      const vSeg = document.createElement("div");
      vSeg.style.cssText = "width:2px;align-self:stretch;min-height:50px;background:var(--accent);flex-shrink:0;";

      // Mirror: invisible clone to balance the row so vSeg stays centered
      const mirror = document.createElement("div");
      mirror.style.cssText = "visibility:hidden;display:flex;flex-direction:row;align-items:center;pointer-events:none;";
      const mDash = document.createElement("div");
      mDash.style.cssText = "width:28px;flex-shrink:0;";
      const mCard = aCard.cloneNode(true);
      mCard.style.cssText = (mCard.style.cssText||"") + ";visibility:hidden;";
      mirror.appendChild(mDash);
      mirror.appendChild(mCard);

      aRow.appendChild(aCard);
      aRow.appendChild(dash);
      aRow.appendChild(vSeg);
      aRow.appendChild(mirror);

      assistantsEl.appendChild(aRow);
    });

    wrap.appendChild(assistantsEl);
  }

  // filhos
  if(hasChildren){
    vDown=document.createElement("div");
    vDown.className="v-line";
    vDown.style.height="28px";
    vDown.style.marginTop = hasAssistants ? "14px" : "10px";
    wrap.appendChild(vDown);

    childrenEl=document.createElement("div");
    childrenEl.className="subtree-children";
    childrenEl.setAttribute("data-depth", depth+1);
    childrenEl._vline=vDown;

    // ÚLTIMO NÍVEL: agrupa por Equipe
    if(childrenAreLeaves(node)){
      const groups = groupLeafChildrenByEquipe(node.children);

      if(groups.length <= 1){
        // Só uma equipe: sem linha horizontal, só vertical
        childrenEl.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:14px;";
        groups.forEach(g => childrenEl.appendChild(makeTeamBox(g.items, g.teamName)));

      } else {
        // Múltiplas equipes: linha horizontal conectando todas
        childrenEl.style.cssText = "display:flex;flex-direction:column;align-items:center;";

        const colsLeaf = document.createElement("div");
        colsLeaf.style.cssText = "display:flex;flex-wrap:nowrap;align-items:flex-start;";

        groups.forEach((g, i) => {
          const isFirst = i === 0;
          const isLast  = i === groups.length - 1;

          const col = document.createElement("div");
          col.style.cssText = "display:flex;flex-direction:column;align-items:center;";

          // Linha horizontal
          const hRow = document.createElement("div");
          hRow.style.cssText = "width:100%;height:2px;display:flex;flex-shrink:0;";

          const hL = document.createElement("div");
          hL.style.cssText = "flex:1;height:2px;background:" + (isFirst ? "transparent" : "var(--accent)") + ";";

          const hC = document.createElement("div");
          hC.style.cssText = "width:2px;height:2px;background:var(--accent);flex-shrink:0;";

          const hR = document.createElement("div");
          hR.style.cssText = "flex:1;height:2px;background:" + (isLast ? "transparent" : "var(--accent)") + ";";

          hRow.appendChild(hL); hRow.appendChild(hC); hRow.appendChild(hR);

          // Vertical descendo até a team-box
          const vDrop = document.createElement("div");
          vDrop.className = "v-line";
          vDrop.style.height = "16px";

          // Team-box com padding lateral
          const inner = document.createElement("div");
          inner.style.cssText = "padding:0 10px;";
          inner.appendChild(makeTeamBox(g.items, g.teamName));

          col.appendChild(hRow);
          col.appendChild(vDrop);
          col.appendChild(inner);
          colsLeaf.appendChild(col);
        });

        childrenEl.appendChild(colsLeaf);
      }

} else if(node.children.length===1){
      childrenEl.style.cssText="display:flex;flex-direction:column;align-items:center;";
      childrenEl.appendChild(renderSubtree(node.children[0], depth+1, node));

    } else {
      childrenEl.style.cssText="display:flex;flex-direction:column;align-items:center;";
      const cols=document.createElement("div");
      cols.style.cssText="display:flex;align-items:flex-start;";

      node.children.forEach((child,i)=>{
        const isFirst=i===0, isLast=i===node.children.length-1, only=node.children.length===1;

        const col=document.createElement("div");
        col.style.cssText="display:flex;flex-direction:column;align-items:center;";

        if(!only){
          // Linha horizontal: 3 partes — esquerda, ponto central, direita
          const hRow=document.createElement("div");
          hRow.style.cssText="width:100%;height:2px;display:flex;flex-shrink:0;";

          const hL=document.createElement("div");
          hL.style.cssText="flex:1;height:2px;background:"+(isFirst?"transparent":"var(--accent)")+";";

          const hC=document.createElement("div");
          hC.style.cssText="width:2px;height:2px;background:var(--accent);flex-shrink:0;";

          const hR=document.createElement("div");
          hR.style.cssText="flex:1;height:2px;background:"+(isLast?"transparent":"var(--accent)")+";";

          hRow.appendChild(hL);
          hRow.appendChild(hC);
          hRow.appendChild(hR);
          col.appendChild(hRow);
        }

        // Linha vertical descendo do centro
        const vDrop=document.createElement("div");
        vDrop.className="v-line";
        vDrop.style.height="22px";
        col.appendChild(vDrop);

        // Subtree com padding lateral para dar espaço entre nós
        const inner=document.createElement("div");
        inner.style.cssText="padding:0 16px;display:flex;flex-direction:column;align-items:center;";
        inner.appendChild(renderSubtree(child, depth+1, node));
        col.appendChild(inner);

        cols.appendChild(col);
      });

      childrenEl.appendChild(cols);    }

    wrap.appendChild(childrenEl);
  }

  return wrap;
}

function childrenAreLeaves(node){
  return (node.children||[]).every(c => (c.children||[]).length===0);
}

function groupLeafChildrenByEquipe(children){
  const map = new Map();
  (children||[]).forEach(ch=>{
    const key = (ch.equipe && String(ch.equipe).trim()) ? String(ch.equipe).trim() : "EQUIPE";
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(ch);
  });

  const groups = Array.from(map.entries()).map(([teamName, items])=>{
    items.sort((a,b)=> (a.nome||"").localeCompare(b.nome||"", "pt-BR"));
    return { teamName, items };
  });

  groups.sort((a,b)=>{
    if(a.teamName==="EQUIPE" && b.teamName!=="EQUIPE") return 1;
    if(b.teamName==="EQUIPE" && a.teamName!=="EQUIPE") return -1;
    return a.teamName.localeCompare(b.teamName, "pt-BR");
  });

  return groups;
}

function makeTeamBox(children, teamName){
  const box=document.createElement("div");
  box.className="team-box";

  const header=document.createElement("div");
  header.className="team-box-header";
  header.textContent = (teamName && String(teamName).trim()) ? String(teamName).trim() : "EQUIPE";
  box.appendChild(header);

  const body=document.createElement("div");
  body.className="team-box-body";

  children.forEach((child,i)=>{
    const member=document.createElement("div");
    member.className="team-box-member";

    // função abaixo do nome
    member.innerHTML = `
      <span class="num">${i+1}</span>
      <div class="team-member-text" style="display:flex;flex-direction:column;gap:2px;">
        <div class="team-member-name" style="font-weight:700;line-height:1.1;">${child.nome || ""}</div>
        ${child.cargo ? `<div class="team-member-role" style="opacity:.75;font-size:.72rem;line-height:1.1;">${child.cargo}</div>` : ""}
      </div>
    `;
    body.appendChild(member);
  });

  box.appendChild(body);
  return box;
}

/* ============================
   FILTERS
============================ */
function applySearch(){
  const inp = document.getElementById("searchInput");
  if(!inp) return;
  const q = inp.value.trim().toLowerCase();

  const areaSel = document.getElementById("areaSelect");
  const levelSel = document.getElementById("levelSelect");
  if(areaSel) areaSel.value="";
  if(levelSel) levelSel.value="99";

  document.querySelectorAll(".node").forEach(el=>{
    el.classList.remove("highlighted","dimmed");
  });
  if(!q) return;

  document.querySelectorAll(".node").forEach(el=>{
    const name = (el.querySelector(".node-name")||{}).textContent||"";
    if(name.toLowerCase().includes(q)) el.classList.add("highlighted");
    else el.classList.add("dimmed");
  });
  document.querySelectorAll(".node.highlighted").forEach(el=> el.classList.remove("dimmed"));
}

function applyAreaFilter(){
  const areaSel = document.getElementById("areaSelect");
  if(!areaSel) return;
  const areaId=areaSel.value;

  const search = document.getElementById("searchInput");
  const levelSel = document.getElementById("levelSelect");
  if(search) search.value="";
  if(levelSel) levelSel.value="99";

  document.querySelectorAll(".node").forEach(el=> el.classList.remove("highlighted","dimmed"));

  if(!areaId){ drawChart(currentRoots); return; }

  function findById(nodes,id){
    for(const n of nodes){
      if(n.id===id) return n;
      const f=findById(n.children,id);
      if(f) return f;
    }
    return null;
  }

  if(currentRoots.length===1){
    const areaNode=findById(currentRoots[0].children, areaId);
    if(areaNode){
      const fakeRoot={...currentRoots[0], children:[areaNode], assistants: currentRoots[0].assistants};
      drawChart([fakeRoot]);
      return;
    }
  }
  const n=findById(currentRoots, areaId);
  if(n) drawChart([n]);
}

function applyLevelFilter(){
  const levelSel = document.getElementById("levelSelect");
  if(!levelSel) return;
  const maxLvl=parseInt(levelSel.value,10);

  const search = document.getElementById("searchInput");
  const areaSel = document.getElementById("areaSelect");
  if(search) search.value="";
  if(areaSel) areaSel.value="";

  document.querySelectorAll(".node").forEach(el=> el.classList.remove("highlighted","dimmed"));

  document.querySelectorAll(".subtree-children").forEach(el=>{
    el.style.display="";
    if(el._vline) el._vline.style.display="";
  });
  document.querySelectorAll(".assistants-below").forEach(el=> el.style.display="");
  document.querySelectorAll(".node .collapse-btn").forEach(btn=> btn.textContent="−");

  document.querySelectorAll('.subtree-children[data-depth]').forEach(el=>{
    const d=parseInt(el.getAttribute("data-depth"),10);
    if(d>maxLvl){
      el.style.display="none";
      if(el._vline) el._vline.style.display="none";
      const parent=el.parentElement;
      if(parent){
        const btn=parent.querySelector(':scope .collapse-btn');
        if(btn) btn.textContent="+";
      }
    }
  });
}

function expandAll(){
  document.querySelectorAll(".subtree-children").forEach(el=>{
    el.style.display="";
    if(el._vline) el._vline.style.display="";
  });
  document.querySelectorAll(".assistants-below").forEach(el=> el.style.display="");
  document.querySelectorAll(".node .collapse-btn").forEach(btn=> btn.textContent="−");
}
function collapseAll(){
  document.querySelectorAll(".subtree-children").forEach(el=>{
    el.style.display="none";
    if(el._vline) el._vline.style.display="none";
  });
  document.querySelectorAll(".assistants-below").forEach(el=> el.style.display="none");
  document.querySelectorAll(".node .collapse-btn").forEach(btn=> btn.textContent="+");
}
function resetFilters(){
  const search = document.getElementById("searchInput");
  const areaSel = document.getElementById("areaSelect");
  const levelSel = document.getElementById("levelSelect");
  if(search) search.value="";
  if(areaSel) areaSel.value="";
  if(levelSel) levelSel.value="99";

  document.querySelectorAll(".node").forEach(el=> el.classList.remove("highlighted","dimmed"));
  expandAll();
  drawChart(currentRoots);
}

/* ============================
   RESET
============================ */
function resetApp(){
  document.getElementById("uploadSection").style.display="block";
  document.getElementById("chartSection").style.display="none";
  document.getElementById("exportBar").style.display="none";
  const fi = document.getElementById("fileInput");
  if(fi) fi.value="";
  document.getElementById("orgChart").innerHTML="";
  const warn=document.getElementById("warnBox");
  if(warn) warn.style.display="none";
  orgData=[];
}

/* ============================
   EXPORT PDF (Sumário + 1 por Disciplina)
============================ */
function exportPDF(){
  return exportPDFByDisciplina();
}

async function exportPDFByDisciplina(){
  const btn = event?.target?.closest(".btn");
  const orig = btn ? btn.innerHTML : "";
  if(btn){ btn.textContent="Gerando..."; btn.disabled=true; }

  try{
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({orientation:"landscape", unit:"pt", format:"a4"});

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const headerH=74;
    const margin=28;

    // Disciplina = nível 2
    let disciplinas=[];
    if(currentRoots.length===1) disciplinas = currentRoots[0].children || [];
    else disciplinas = currentRoots;

    if(!disciplinas.length){
      alert("Não encontrei Disciplina (nível 2).");
      return;
    }

    const totalPages = 1 + disciplinas.length;

    // --- Sumário (página 1)
    drawPdfHeader(pdf, `${PDF_HEADER.titlePrefix} - SUMARIO`, 1, totalPages, pageW, headerH, margin);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(50,50,70);
    pdf.setFontSize(13);
    pdf.text("Sumario", margin, headerH + margin + 10);

    pdf.setTextColor(50,50,70);
    pdf.setFontSize(10);
    let y = headerH + margin + 26;

    // Column positions
    const colNum   = margin;            // "1."
    const colDisc  = margin + 18;       // "Caldeiraria"
    const colName  = margin + 140;      // "JONAS CUPERTINO..."  (wide gap)
    const colPage  = pageW - margin;    // "Pagina 2" right-aligned

    // Header row
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(150,100,40);
    pdf.text("Disciplina", colDisc, y);
    pdf.text("Coordenador / Responsavel", colName, y);
    pdf.text("Pagina", colPage, y, {align:"right"});
    y += 5;
    pdf.setDrawColor(200,133,58);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageW - margin, y);
    y += 10;

    disciplinas.forEach((n,i)=>{
      const disc  = stripAccents(getDisciplinaForNode(n));
      const nome  = stripAccents(n.nome||"");
      const cargo = stripAccents(n.cargo||"-");

      // alternating row bg
      if(i % 2 === 0){
        pdf.setFillColor(250,247,242);
        pdf.rect(margin - 2, y - 9, pageW - margin*2 + 4, 13, "F");
      }

      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(50,50,70);
      pdf.text(`${i+1}.`, colNum, y);
      pdf.text(disc, colDisc, y);

      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(80,80,100);
      pdf.text(`${nome} (${cargo})`, colName, y);

      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(200,133,58);
      pdf.text(`${i+2}`, colPage, y, {align:"right"});

      pdf.setTextColor(50,50,70);
      y += 14;

      if (y > pageH - margin - 10) {
        pdf.addPage();
        drawPdfHeader(pdf, `${PDF_HEADER.titlePrefix} - SUMARIO (cont.)`, 1, totalPages, pageW, headerH, margin);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(50,50,70);
        pdf.setFontSize(10);
        y = headerH + margin + 20;
      }
    });

    // Stage oculto para renderizar só a subárvore da disciplina
    const stage = document.createElement("div");
    stage.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;padding:24px;";
    document.body.appendChild(stage);

    let pageIdx = 2;
    for(const node of disciplinas){
      const disc = getDisciplinaForNode(node);

      pdf.addPage();
      drawPdfHeader(pdf, `${PDF_HEADER.titlePrefix} - ${stripAccents(disc)}`, pageIdx, totalPages, pageW, headerH, margin);

      stage.innerHTML="";
      stage.appendChild(renderSubtree(node, 0, null));

      // garante layout pronto
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

      const canvas = await html2canvas(stage, {scale:2, backgroundColor:"#ffffff"});
      const img = canvas.toDataURL("image/png");

      const usableW = pageW - margin*2;
      const usableH = pageH - margin*2 - headerH;

      const ratio = Math.min(usableW / canvas.width, usableH / canvas.height);
      const drawW = canvas.width * ratio;
      const drawH = canvas.height * ratio;

      const x = margin + (usableW - drawW)/2;
      const y2 = headerH + margin + (usableH - drawH)/2;

      pdf.addImage(img, "PNG", x, y2, drawW, drawH);

      pageIdx++;
    }

    document.body.removeChild(stage);
    pdf.save("organograma_por_disciplina.pdf");
  }catch(e){
    alert("Erro ao gerar PDF: " + e.message);
    console.error(e);
  }finally{
    if(btn){ btn.innerHTML=orig; btn.disabled=false; }
  }
}

function drawPdfHeader(pdf, title, pageNum, totalPages, pageW, headerH, margin){
  const dateStr = (PDF_HEADER.date && PDF_HEADER.date.trim())
    ? PDF_HEADER.date.trim()
    : new Date().toLocaleDateString("pt-BR");

  // fundo branco
  pdf.setFillColor(255,255,255);
  pdf.rect(0,0,pageW,headerH,"F");

  // logo — use uploaded or embedded default
  const logoSrc = (typeof LOGO_DATA_URL !== "undefined" && LOGO_DATA_URL) ? LOGO_DATA_URL : (typeof LOGO_SGS_B64 !== "undefined" ? LOGO_SGS_B64 : null);
  if (logoSrc) {
    // jsPDF addImage accepts data URL directly — strip the prefix for format detection
    const isJpeg = logoSrc.includes("image/jpeg") || logoSrc.includes("image/jpg");
    const fmt = isJpeg ? "JPEG" : "PNG";
    const logoW = 120;
    const logoH = 50;
    // Strip data URL prefix if present — jsPDF needs raw base64 for some versions
    try {
      pdf.addImage(logoSrc, fmt, margin, 10, logoW, logoH);
    } catch(e1) {
      try {
        // Some jsPDF versions accept full data URL
        const raw = logoSrc.split(",")[1] || logoSrc;
        pdf.addImage(raw, fmt, margin, 10, logoW, logoH);
      } catch(e2) {
        console.warn("Logo failed:", e2);
      }
    }
  }

  // linha laranja vertical (estilo)
  pdf.setDrawColor(255, 102, 0);
  pdf.setLineWidth(2);
  pdf.line(margin + 140, 8, margin + 140, headerH - 8);

  // título  (ORGANOGRAMA — NOME DA DISCIPLINA)
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 102, 0);
  pdf.setFontSize(13);
  pdf.text(stripAccents(title), pageW - margin, 22, {align:"right"});

  // meta: só Data, Atualizado por, Aprovado por (sem docCode/revision)
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(70,70,90);
  pdf.setFontSize(9);
  pdf.text(`Data: ${dateStr}`, pageW - margin, 36, {align:"right"});
  pdf.text(`Atualizado por: ${stripAccents(PDF_HEADER.updatedBy)}`, pageW - margin, 48, {align:"right"});
  pdf.text(`Aprovado por: ${stripAccents(PDF_HEADER.approvedBy)}`, pageW - margin, 60, {align:"right"});

  // paginação no RODAPÉ da página (não do cabeçalho)
  pdf.setTextColor(90,90,110);
  pdf.setFontSize(8);
  const _pH = pdf.internal.pageSize.getHeight();
  pdf.text(`Pagina ${pageNum} de ${totalPages}`, pageW - margin, _pH - 10, {align:"right"});
}

/* ============================
   PPTX (placeholder simples)
============================ */

function exportPDFByCoordinator(){ return exportPDFByDisciplina(); }



/* ============================
   EXPORTAR HTML SOMENTE LEITURA (para coordenadores)
============================ */
function exportViewHTML() {
  if (!orgData || !orgData.length) { alert("Importe uma base primeiro."); return; }
  var btn = event && event.target ? event.target.closest(".btn") : null;
  var orig = btn ? btn.innerHTML : "";
  if (btn) { btn.textContent = "Gerando..."; btn.disabled = true; }
  try {
    var dataStr = JSON.stringify(orgData);
    var logoSrc = (typeof LOGO_DATA_URL !== "undefined" && LOGO_DATA_URL) ? LOGO_DATA_URL
                : (typeof LOGO_SGS_B64 !== "undefined" ? LOGO_SGS_B64 : "");
    var logoTag = logoSrc
      ? '<img src="' + logoSrc + '" style="height:38px;object-fit:contain;" alt="Logo">'
      : '<span style="font-size:1.4rem;font-weight:900;color:var(--accent)">SGS</span>';
    var TMPL = "<!DOCTYPE html><html lang=\"pt-BR\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Organograma</title><link href=\"https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;700;800&display=swap\" rel=\"stylesheet\"><style>*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n\n:root{\n  --cream:#FAF7F2; --dark:#1A1A2E; --accent:#C8853A;\n  --accent-light:#F0D5B5; --border:#E2D9CE; --border-strong:#C9B9A7;\n  --text:#2C2C3E; --sub:#7A7A8C; --green:#2D6A4F; --green-light:#EAF4F0;\n  --asst:#4A7FC1; --asst-light:#D6E6F7;\n\n  --surface:#ffffff;\n  --shadow: 0 4px 40px rgba(0,0,0,0.06);\n}\n\nbody{\n  font-family:'DM Sans',sans-serif;\n  background:var(--cream);\n  color:var(--text);\n  min-height:100vh;\n}\n\nbody.dark{\n  --cream:#0f111a;\n  --surface:#141827;\n  --text:#E8E9F1;\n  --sub:#A7A9BE;\n  --border:#2b2f44;\n  --border-strong:#3a3f59;\n  --shadow: 0 4px 40px rgba(0,0,0,0.35);\n}\n\nheader{\n  background:var(--dark);\n  color:white;\n  padding:16px 22px;\n  display:flex;\n  align-items:center;\n  justify-content:space-between;\n  gap:14px;\n  position:sticky; top:0; z-index:100;\n  box-shadow:0 2px 20px rgba(0,0,0,0.2);\n}\n\n.brand{ display:flex; align-items:center; gap:10px; }\nheader h1{ font-family:'DM Serif Display',serif; font-size:1.4rem; }\n.badge{\n  font-size:.72rem; background:var(--accent);\n  padding:3px 10px; border-radius:20px;\n  font-weight:800; letter-spacing:.03em;\n}\n\n.toolbar{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }\n.toolbar-divider{ width:1px; height:32px; background:rgba(255,255,255,0.25); margin:0 4px; }\n\n.btn{\n  padding:8px 14px;\n  border:none; border-radius:10px;\n  font-family:'DM Sans',sans-serif;\n  font-size:.83rem;\n  font-weight:700;\n  cursor:pointer;\n  display:inline-flex;\n  align-items:center;\n  gap:7px;\n  transition:.2s;\n  white-space:nowrap;\n}\n.btn:disabled{ opacity:.5; cursor:not-allowed; transform:none!important; }\n\n.btn-accent{ background:var(--accent); color:white; }\n.btn-accent:hover{ background:#a86b28; transform:translateY(-1px); }\n\n.btn-green{ background:var(--green); color:white; }\n.btn-green:hover{ background:#1e4d37; transform:translateY(-1px); }\n\n.btn-outline{\n  background:transparent;\n  color:white;\n  border:1.5px solid rgba(255,255,255,0.28);\n}\n.btn-outline:hover{ background:rgba(255,255,255,0.08); }\n\n.btn-outline-dark{\n  background:transparent;\n  color:var(--text);\n  border:1.5px solid var(--border-strong);\n}\n.btn-outline-dark:hover{\n  border-color:var(--accent);\n  color:var(--accent);\n}\n\n.main{ padding:30px 22px; }\n\n.upload-section{ max-width:720px; margin:0 auto; }\n.instructions{\n  background:var(--surface);\n  border-radius:16px;\n  border:1px solid var(--border);\n  padding:24px 26px;\n  margin-bottom:18px;\n  box-shadow:var(--shadow);\n}\n\n.instructions h3{\n  font-family:'DM Serif Display',serif;\n  font-size:1.2rem;\n  margin-bottom:14px;\n}\n\n.step{ display:flex; gap:12px; margin-bottom:12px; align-items:flex-start; }\n.step-num{\n  background:var(--accent); color:white;\n  border-radius:50%; width:26px; height:26px;\n  display:flex; align-items:center; justify-content:center;\n  font-size:.78rem; font-weight:900; flex-shrink:0; margin-top:2px;\n}\n.step p{ font-size:.87rem; line-height:1.55; color:var(--text); }\n\ncode{\n  background:var(--accent-light);\n  padding:1px 7px; border-radius:4px;\n  font-size:.82rem; font-weight:900; color:var(--dark);\n}\n\n.info-box{\n  background:#EEF4FF;\n  border:1px solid #C0D4F0;\n  border-radius:12px;\n  padding:12px 14px;\n  margin-top:12px;\n  font-size:.85rem;\n  color:#2A4A7F;\n  display:flex;\n  align-items:center;\n  justify-content:space-between;\n  gap:12px;\n}\n\n.warn-box{\n  margin-top:12px;\n  background:#fff3cd;\n  border:1px solid #ffe69c;\n  border-radius:12px;\n  padding:12px 14px;\n  color:#7a5a00;\n  font-size:.86rem;\n}\n.warn-box ul{ margin-top:8px; padding-left:18px; }\n.warn-box li{ margin:4px 0; }\n\n.download-tpl{\n  display:inline-flex; align-items:center; gap:6px;\n  color:var(--accent); font-weight:800; font-size:.85rem;\n  cursor:pointer; border:none; background:none; padding:0;\n  margin-top:12px; text-decoration:underline; text-underline-offset:3px;\n}\n\n.upload-zone{\n  border:2.5px dashed var(--border);\n  border-radius:20px;\n  background:var(--surface);\n  padding:46px 30px;\n  text-align:center;\n  cursor:pointer;\n  transition:.3s;\n  box-shadow:var(--shadow);\n}\n.upload-zone:hover,.upload-zone.drag{ border-color:var(--accent); background:#FDF5EA; }\n.upload-zone h2{\n  font-family:'DM Serif Display',serif;\n  font-size:1.5rem;\n  margin-bottom:8px;\n}\n.upload-zone p{ color:var(--sub); font-size:.88rem; }\n#fileInput{ display:none; }\n\n/* CHART */\n.status-bar{ display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-bottom:14px; }\n.stat{\n  background:var(--surface); border:1px solid var(--border);\n  border-radius:10px; padding:9px 14px; font-size:.84rem;\n  box-shadow:var(--shadow);\n}\n.stat strong{ color:var(--accent); font-size:1.1rem; margin-right:4px; }\n.tip{\n  background:var(--green-light); border:1px solid #C3E0D4;\n  border-radius:10px; padding:9px 14px; font-size:.82rem;\n  color:var(--green); margin-left:auto;\n}\n\n/* FILTERS */\n.filters-bar{\n  background:var(--surface);\n  border:1px solid var(--border);\n  border-radius:14px;\n  padding:12px 16px;\n  margin-bottom:12px;\n  display:flex;\n  gap:12px;\n  align-items:center;\n  flex-wrap:wrap;\n  box-shadow:var(--shadow);\n}\n.filter-group{ display:flex; flex-direction:column; gap:4px; min-width:160px; }\n.filter-label{ font-size:.72rem; font-weight:900; color:var(--sub); text-transform:uppercase; letter-spacing:.05em; }\n.filter-input{\n  padding:6px 10px; border:1.5px solid var(--border);\n  border-radius:10px; font-family:'DM Sans',sans-serif;\n  font-size:.84rem; color:var(--text);\n  background:var(--cream); outline:none;\n}\n.filter-input:focus{ border-color:var(--accent); }\n.filter-divider{ width:1px; height:40px; background:var(--border); margin:0 2px; }\n.filter-btn{\n  padding:6px 14px; border:1.5px solid var(--border);\n  border-radius:10px; font-family:'DM Sans',sans-serif;\n  font-size:.82rem; font-weight:800;\n  cursor:pointer; background:var(--surface); color:var(--sub);\n  transition:.2s; white-space:nowrap;\n}\n.filter-btn:hover{ border-color:var(--accent); color:var(--accent); }\n.search-wrap{ position:relative; }\n.search-wrap svg{ position:absolute; left:9px; top:50%; transform:translateY(-50%); color:var(--sub); pointer-events:none; }\n.search-wrap .filter-input{ padding-left:30px; }\n\n/* Legend + chart */\n.legend{ display:flex; gap:18px; align-items:center; margin-bottom:10px; font-size:.8rem; color:var(--sub); flex-wrap:wrap; }\n.legend-item{ display:flex; align-items:center; gap:7px; }\n.leg-box{ width:22px; height:14px; border-radius:4px; }\n\n.chart-wrap{\n  background:var(--surface);\n  border-radius:16px;\n  border:1px solid var(--border);\n  padding:26px 18px;\n  overflow:auto;\n  box-shadow:var(--shadow);\n  cursor:grab;\n  user-select:none;\n  height: calc(100vh - 320px);\n  min-height: 420px;\n}\n.chart-wrap.dragging{ cursor:grabbing; }\n\n#orgChart{\n  display:inline-flex;\n  flex-direction:column;\n  align-items:center;\n  min-width:100%;\n  transform-origin: top left;\n}\n\n/* Nodes */\n.node{\n  background:rgba(255,255,255,0.98);\n  border:2px solid var(--border-strong);\n  border-radius:12px;\n  padding:10px 16px;\n  min-width:150px;\n  max-width:230px;\n  text-align:center;\n  box-shadow:0 2px 12px rgba(0,0,0,0.07);\n  transition:box-shadow .2s, transform .2s;\n  position:relative;\n}\nbody.dark .node{ background:rgba(20,24,39,0.95); }\n\n.node:hover{ box-shadow:0 8px 26px rgba(200,133,58,0.22); transform:translateY(-2px); }\n\n.node-name{ font-weight:800; font-size:.87rem; color:var(--text); line-height:1.25; margin-bottom:6px; }\n.node-role{\n  font-size:.69rem; font-weight:900;\n  background:var(--accent-light); color:var(--accent);\n  border-radius:6px; padding:3px 10px;\n  display:inline-block;\n  text-transform:uppercase;\n  letter-spacing:.05em;\n}\n.node.root{ border:2px solid var(--accent); }\n.node.root .node-role{ background:var(--accent); color:white; }\n\n.node.assistant{ border:2px dashed var(--asst); }\n.node.assistant .node-role{ background:var(--asst-light); color:var(--asst); }\n\n.v-line{ width:2px; background:var(--accent); margin:0 auto; }\n\n/* Collapse btn */\n.node .collapse-btn{\n  position:absolute; bottom:-10px; left:50%; transform:translateX(-50%);\n  width:18px; height:18px; border-radius:50%;\n  background:var(--accent); color:white; border:none;\n  font-size:.7rem; cursor:pointer;\n  display:flex; align-items:center; justify-content:center;\n  font-weight:900; z-index:10; line-height:1;\n  box-shadow:0 1px 4px rgba(0,0,0,0.25);\n}\n\n/* Search highlight */\n.node.highlighted{ border:2px solid #F5A623!important; box-shadow:0 0 0 3px rgba(245,166,35,0.3)!important; }\n.node.dimmed{ opacity:.22; }\n\n/* ASSISTENTES: \u00e0 direita do gestor, na mesma linha horizontal */\n.assistants-below{\n  display:flex;\n  flex-direction:row;\n  align-items:center;\n  gap:0;\n}\n\n/* Team box */\n.team-box{\n  border-radius:12px; overflow:hidden;\n  min-width:180px; max-width:260px;\n  box-shadow:0 4px 16px rgba(0,0,0,0.13);\n}\n.team-box-header{\n  background:#1e4d37;\n  color:white;\n  padding:7px 12px;\n  font-size:.72rem;\n  font-weight:900;\n  text-transform:uppercase;\n  letter-spacing:.07em;\n  text-align:center;\n}\n.team-box-body{ background:var(--green); padding:10px 12px; }\n.team-box-member{\n  display:flex; align-items:center; gap:8px;\n  color:white; font-size:.79rem;\n  padding:5px 0;\n  border-bottom:1px solid rgba(255,255,255,0.16);\n}\n.team-box-member:last-child{ border-bottom:none; }\n.team-box-member .num{ font-size:.68rem; opacity:.65; min-width:16px; font-weight:900; }\n\n/* Zoom UI */\n.zoom-box{ display:flex; align-items:center; gap:10px; padding:6px 10px; border-radius:12px; border:1px solid rgba(255,255,255,0.2); }\n.zoom-pill{ font-weight:900; font-size:.78rem; color:#fff; opacity:.95; min-width:44px; text-align:right; }\n.zoom-range{ width:140px; }\n\n.node.flash{ box-shadow:0 0 0 4px rgba(200,133,58,0.25); }</style></head><body><header><div class=\"brand\">__LOGO__<div class=\"toolbar-divider\"></div><h1>Organograma</h1><span class=\"badge\">VISUALIZA&#199;&#195;O</span></div><div class=\"toolbar\"><button class=\"btn btn-outline\" id=\"darkBtn\" onclick=\"toggleDark()\">&#127769; Modo escuro</button><div class=\"zoom-box\"><span class=\"zoom-pill\" id=\"zoomPill\">100%</span><input id=\"zoomRange\" class=\"zoom-range\" type=\"range\" min=\"10\" max=\"150\" value=\"100\" oninput=\"applyZoom(this.value)\"></div></div></header><div class=\"main\"><div class=\"status-bar\" id=\"statusBar\"></div><div class=\"filters-bar\"><div class=\"filter-group\" style=\"min-width:200px\"><div class=\"filter-label\">Buscar pessoa</div><div class=\"search-wrap\"><svg width=\"13\" height=\"13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"M21 21l-4.35-4.35\"/></svg><input class=\"filter-input\" id=\"searchInput\" type=\"text\" placeholder=\"Nome...\" oninput=\"applySearch()\"></div></div><div class=\"filter-divider\"></div><div class=\"filter-group\"><div class=\"filter-label\">Filtrar por area</div><select class=\"filter-input\" id=\"areaSelect\" onchange=\"applyAreaFilter()\"><option value=\"\">Todas as areas</option></select></div><div class=\"filter-divider\"></div><div class=\"filter-group\"><div class=\"filter-label\">Mostrar ate nivel</div><select class=\"filter-input\" id=\"levelSelect\" onchange=\"applyLevelFilter()\"><option value=\"99\">Todos os niveis</option></select></div><div class=\"filter-divider\"></div><div class=\"filter-group\" style=\"min-width:auto\"><div class=\"filter-label\">Recolher</div><div style=\"display:flex;gap:6px\"><button class=\"filter-btn\" onclick=\"expandAll()\">Expandir tudo</button><button class=\"filter-btn\" onclick=\"collapseAll()\">Recolher tudo</button></div></div><button class=\"filter-btn\" onclick=\"resetFilters()\" style=\"align-self:flex-end;margin-left:auto\">x Limpar filtros</button></div><div class=\"legend\"><span class=\"legend-item\"><span class=\"leg-box\" style=\"border:2px solid var(--border-strong);background:white\"></span> Hierarquia normal</span> <span class=\"legend-item\"><span class=\"leg-box\" style=\"border:2px dashed var(--asst);background:var(--asst-light)\"></span> Assistente</span> <span class=\"legend-item\"><span class=\"leg-box\" style=\"background:var(--green);border-radius:3px\"></span> Equipe</span></div><div class=\"chart-wrap\" id=\"chartWrap\"><div id=\"orgChart\"></div></div></div><script>var orgData=__DATA__;var currentRoots=[],maxDepth=0,countsMap={};\nfunction clamp(v,a,b){ return Math.min(b, Math.max(a,v)); }\n\n\nfunction normStr(s){ return String(s||\"\").trim(); }\n\n\nfunction stripAccents(s){\n  return String(s||\"\")\n    .normalize(\"NFD\")\n    .replace(/[\u0300-\u036f]/g,\"\")\n    .replace(/[^\u0000-\u007f]/g,\"?\");\n}\n\n\nfunction buildTree(data){\n  const map={};\n  data.forEach(p=> map[p.id]={...p, children:[], assistants:[]});\n\n  const byNameIds={};\n  data.forEach(p=>{\n    byNameIds[p.nome]=byNameIds[p.nome]||[];\n    byNameIds[p.nome].push(p.id);\n  });\n\n  const roots=[];\n  data.forEach(p=>{\n    const node=map[p.id];\n    let parentId=\"\";\n\n    if(p.gestorId && map[p.gestorId]) parentId=p.gestorId;\n    else if(p.gestor){\n      const ids=byNameIds[p.gestor]||[];\n      if(ids.length===1) parentId=ids[0];\n    }\n\n    if(parentId){\n      if(p.assistente) map[parentId].assistants.push(node);\n      else map[parentId].children.push(node);\n    }else{\n      if(!p.assistente) roots.push(node);\n    }\n  });\n\n  return roots;\n}\n\n\nfunction computeCounts(roots){\n  const m={};\n  function walk(n){\n    const direct=(n.children?.length||0);\n    let total=direct;\n    (n.children||[]).forEach(ch=> total += 1 + walk(ch));\n    m[n.id]={direct,total};\n    return total;\n  }\n  roots.forEach(r=>walk(r));\n  return m;\n}\n\n\nfunction calcMaxDepth(node,d){\n  maxDepth=Math.max(maxDepth,d);\n  (node.children||[]).forEach(c=>calcMaxDepth(c,d+1));\n}\n\n\nfunction childrenAreLeaves(node){\n  return (node.children||[]).every(c => (c.children||[]).length===0);\n}\n\n\nfunction groupLeafChildrenByEquipe(children){\n  const map = new Map();\n  (children||[]).forEach(ch=>{\n    const key = (ch.equipe && String(ch.equipe).trim()) ? String(ch.equipe).trim() : \"EQUIPE\";\n    if(!map.has(key)) map.set(key, []);\n    map.get(key).push(ch);\n  });\n\n  const groups = Array.from(map.entries()).map(([teamName, items])=>{\n    items.sort((a,b)=> (a.nome||\"\").localeCompare(b.nome||\"\", \"pt-BR\"));\n    return { teamName, items };\n  });\n\n  groups.sort((a,b)=>{\n    if(a.teamName===\"EQUIPE\" && b.teamName!==\"EQUIPE\") return 1;\n    if(b.teamName===\"EQUIPE\" && a.teamName!==\"EQUIPE\") return -1;\n    return a.teamName.localeCompare(b.teamName, \"pt-BR\");\n  });\n\n  return groups;\n}\n\nfunction makeTeamBox(children, teamName){\n  var box = document.createElement(\"div\"); box.className = \"team-box\";\n  var header = document.createElement(\"div\"); header.className = \"team-box-header\";\n  header.textContent = (teamName && String(teamName).trim()) ? String(teamName).trim() : \"EQUIPE\";\n  box.appendChild(header);\n  var body = document.createElement(\"div\"); body.className = \"team-box-body\";\n  children.forEach(function(child, i){\n    var member = document.createElement(\"div\"); member.className = \"team-box-member\";\n    var numEl = document.createElement(\"span\"); numEl.className = \"num\"; numEl.textContent = (i+1);\n    var info = document.createElement(\"div\"); info.style.cssText = \"display:flex;flex-direction:column;gap:2px;\";\n    var nameEl = document.createElement(\"div\"); nameEl.style.cssText = \"font-weight:700;line-height:1.1;\"; nameEl.textContent = child.nome || \"\";\n    info.appendChild(nameEl);\n    if(child.cargo){\n      var roleEl = document.createElement(\"div\"); roleEl.style.cssText = \"opacity:.75;font-size:.72rem;\"; roleEl.textContent = child.cargo;\n      info.appendChild(roleEl);\n    }\n    member.appendChild(numEl); member.appendChild(info);\n    body.appendChild(member);\n  });\n  box.appendChild(body);\n  return box;\n}\n\n\nfunction renderSubtree(node, depth, parentNode){\n  const wrap=document.createElement(\"div\");\n  wrap.style.cssText=\"display:flex;flex-direction:column;align-items:center;\";\n\n  const hasAssistants = node.assistants && node.assistants.length>0;\n  const hasChildren   = node.children && node.children.length>0;\n\n  let childrenEl=null, vDown=null, assistantsEl=null;\n\n  const counts = countsMap[node.id] || {direct:0,total:0};\n  const tip = [\n    (\"Reporta para: \" + (parentNode ? parentNode.nome : \"Topo\")),\n    (\"Subordinados: \" + (counts.direct) + \" diretos / \" + (counts.total) + \" total\"),\n    (\"ID: \" + (node.id))\n  ].join(\"\\n\");\n\n  const card=document.createElement(\"div\");\n  card.className=\"node\" + (depth===0 ? \" root\" : \"\");\n  card.title = tip;\n  card.innerHTML = (\"<div class=\\\"node-name\\\">\" + (node.nome) + \"</div><div class=\\\"node-role\\\">\" + (node.cargo||\"\u2014\") + \"</div>\");\n\n  card.addEventListener(\"click\",(e)=>{\n    e.stopPropagation();\n    card.scrollIntoView({behavior:\"smooth\", block:\"center\", inline:\"center\"});\n    card.classList.add(\"flash\");\n    setTimeout(()=>card.classList.remove(\"flash\"),420);\n  });\n\n  if(hasChildren || hasAssistants){\n    const btn=document.createElement(\"button\");\n    btn.className=\"collapse-btn\";\n    btn.textContent=\"\u2212\";\n    btn.title=\"Recolher/Expandir\";\n    btn.addEventListener(\"click\",(e)=>{\n      e.stopPropagation();\n      const anyVisible =\n        (childrenEl && childrenEl.style.display!==\"none\") ||\n        (vDown && vDown.style.display!==\"none\") ||\n        (assistantsEl && assistantsEl.style.display!==\"none\");\n\n      const val = anyVisible ? \"none\" : \"\";\n      if(assistantsEl) assistantsEl.style.display = val;\n      if(childrenEl) childrenEl.style.display = val;\n      if(vDown) vDown.style.display = val;\n\n      btn.textContent = anyVisible ? \"+\" : \"\u2212\";\n    });\n    card.appendChild(btn);\n  }\n\n  // Card centered in wrap\n  wrap.appendChild(card);\n\n  // Assistants BELOW the card, connected by the vertical spine\n  // Each row: [aCard] [dash 28px] [vSeg 2px]  \u2014 centered under card\n  // The vSeg (rightmost 2px) must align with the card's center axis.\n  // We achieve this by centering each aRow in wrap and making vSeg flush-right\n  // of the card+dash combination, using a hidden mirror on the right.\n  if(hasAssistants){\n    assistantsEl = document.createElement(\"div\");\n    assistantsEl.className = \"assistants-below\";\n    assistantsEl.style.cssText = \"display:flex;flex-direction:column;align-items:center;width:100%;\";\n\n    node.assistants.forEach(asst => {\n      // aRow: [aCard][dash][vSeg]  all in one flex-row\n      // We use a trick: aRow is centered in wrap (align-items:center on wrap)\n      // aCard is on the LEFT, vSeg is the 2px RIGHT edge aligned with card center\n      // Mirror (hidden) on right keeps centering stable\n      const aRow = document.createElement(\"div\");\n      aRow.style.cssText = \"display:flex;flex-direction:row;align-items:center;\";\n\n      const aCard = document.createElement(\"div\");\n      aCard.className = \"node assistant\";\n      aCard.title = (\"Reporta para: \" + (node.nome) + \"\\nID: \" + (asst.id));\n      aCard.innerHTML = (\"<div class=\\\"node-name\\\">\" + (asst.nome) + \"</div><div class=\\\"node-role\\\">\" + (asst.cargo||\"\u2014\") + \"</div>\");\n      aCard.addEventListener(\"click\",(e)=>{\n        e.stopPropagation();\n        aCard.scrollIntoView({behavior:\"smooth\", block:\"center\", inline:\"center\"});\n        aCard.classList.add(\"flash\");\n        setTimeout(()=>aCard.classList.remove(\"flash\"),420);\n      });\n\n      const dash = document.createElement(\"div\");\n      dash.style.cssText = \"width:28px;border-top:2px dashed var(--asst);flex-shrink:0;\";\n\n      // vSeg: continues the vertical spine through the assistant row\n      const vSeg = document.createElement(\"div\");\n      vSeg.style.cssText = \"width:2px;align-self:stretch;min-height:50px;background:var(--accent);flex-shrink:0;\";\n\n      // Mirror: invisible clone to balance the row so vSeg stays centered\n      const mirror = document.createElement(\"div\");\n      mirror.style.cssText = \"visibility:hidden;display:flex;flex-direction:row;align-items:center;pointer-events:none;\";\n      const mDash = document.createElement(\"div\");\n      mDash.style.cssText = \"width:28px;flex-shrink:0;\";\n      const mCard = aCard.cloneNode(true);\n      mCard.style.cssText = (mCard.style.cssText||\"\") + \";visibility:hidden;\";\n      mirror.appendChild(mDash);\n      mirror.appendChild(mCard);\n\n      aRow.appendChild(aCard);\n      aRow.appendChild(dash);\n      aRow.appendChild(vSeg);\n      aRow.appendChild(mirror);\n\n      assistantsEl.appendChild(aRow);\n    });\n\n    wrap.appendChild(assistantsEl);\n  }\n\n  // filhos\n  if(hasChildren){\n    vDown=document.createElement(\"div\");\n    vDown.className=\"v-line\";\n    vDown.style.height=\"28px\";\n    vDown.style.marginTop = hasAssistants ? \"14px\" : \"10px\";\n    wrap.appendChild(vDown);\n\n    childrenEl=document.createElement(\"div\");\n    childrenEl.className=\"subtree-children\";\n    childrenEl.setAttribute(\"data-depth\", depth+1);\n    childrenEl._vline=vDown;\n\n    // \u00daLTIMO N\u00cdVEL: agrupa por Equipe\n    if(childrenAreLeaves(node)){\n      const groups = groupLeafChildrenByEquipe(node.children);\n\n      if (groups.length <= 1) {\n        childrenEl.style.cssText = \"display:flex;flex-direction:column;align-items:center;gap:14px;\";\n      } else {\n        // \u2705 TUDO lado a lado, sem quebrar linha\n        childrenEl.style.cssText =\n          \"display:flex;flex-direction:row;flex-wrap:nowrap;justify-content:flex-start;align-items:flex-start;gap:18px;\";\n      }\n\n      // \u2705 largura m\u00ednima para TODAS as caixas caberem na mesma linha\n      if (groups.length > 1) {\n        const BOX_W = 240;     // ~team-box (max 220) + folga\n        const GAP   = 18;      // mesmo gap do flex\n        const minW  = groups.length * BOX_W + (groups.length - 1) * GAP;\n\n        childrenEl.style.minWidth = minW + \"px\";\n        wrap.style.minWidth = Math.max(minW, 260) + \"px\";\n      }\n\n      groups.forEach(g=>{\n        childrenEl.appendChild(makeTeamBox(g.items, g.teamName));\n      });\n\n    } else if(node.children.length===1){\n      childrenEl.style.cssText=\"display:flex;flex-direction:column;align-items:center;\";\n      childrenEl.appendChild(renderSubtree(node.children[0], depth+1, node));\n\n    } else {\n      childrenEl.style.cssText=\"display:flex;flex-direction:column;align-items:center;\";\n      const cols=document.createElement(\"div\");\n      cols.style.cssText=\"display:flex;align-items:flex-start;\";\n\n      node.children.forEach((child,i)=>{\n        const isFirst = i===0;\n        const isLast  = i===node.children.length-1;\n\n        const col=document.createElement(\"div\");\n        col.style.cssText=\"display:flex;flex-direction:column;align-items:center;padding:0 18px;position:relative;\";\n\n        const hSeg=document.createElement(\"div\");\n        hSeg.style.cssText=(\"position:absolute;top:0;height:2px;background:var(--accent);left:\" + (isFirst?\"50%\":\"0\") + \";right:\" + (isLast?\"50%\":\"0\") + \";\");\n        col.appendChild(hSeg);\n\n        const vTop=document.createElement(\"div\");\n        vTop.className=\"v-line\";\n        vTop.style.height=\"24px\";\n        col.appendChild(vTop);\n\n        col.appendChild(renderSubtree(child, depth+1, node));\n        cols.appendChild(col);\n      });\n\n      childrenEl.appendChild(cols);\n    }\n\n    wrap.appendChild(childrenEl);\n  }\n\n  return wrap;\n}\n\n\nfunction drawChart(roots){\n  const chart=document.getElementById(\"orgChart\");\n  chart.innerHTML=\"\";\n\n  if(!roots.length){\n    chart.innerHTML='<p style=\"color:red;padding:20px\">Nenhuma raiz encontrada.</p>';\n    return;\n  }\n\n  if(roots.length===1){\n    chart.appendChild(renderSubtree(roots[0],0,null));\n  }else{\n    const row=document.createElement(\"div\");\n    row.style.cssText=\"display:flex;gap:60px;align-items:flex-start;justify-content:center;\";\n    roots.forEach(r=>row.appendChild(renderSubtree(r,0,null)));\n    chart.appendChild(row);\n  }\n}\n\n\nfunction applySearch(){\n  const inp = document.getElementById(\"searchInput\");\n  if(!inp) return;\n  const q = inp.value.trim().toLowerCase();\n\n  const areaSel = document.getElementById(\"areaSelect\");\n  const levelSel = document.getElementById(\"levelSelect\");\n  if(areaSel) areaSel.value=\"\";\n  if(levelSel) levelSel.value=\"99\";\n\n  document.querySelectorAll(\".node\").forEach(el=>{\n    el.classList.remove(\"highlighted\",\"dimmed\");\n  });\n  if(!q) return;\n\n  document.querySelectorAll(\".node\").forEach(el=>{\n    const name = (el.querySelector(\".node-name\")||{}).textContent||\"\";\n    if(name.toLowerCase().includes(q)) el.classList.add(\"highlighted\");\n    else el.classList.add(\"dimmed\");\n  });\n  document.querySelectorAll(\".node.highlighted\").forEach(el=> el.classList.remove(\"dimmed\"));\n}\n\n\nfunction applyAreaFilter(){\n  const areaSel = document.getElementById(\"areaSelect\");\n  if(!areaSel) return;\n  const areaId=areaSel.value;\n\n  const search = document.getElementById(\"searchInput\");\n  const levelSel = document.getElementById(\"levelSelect\");\n  if(search) search.value=\"\";\n  if(levelSel) levelSel.value=\"99\";\n\n  document.querySelectorAll(\".node\").forEach(el=> el.classList.remove(\"highlighted\",\"dimmed\"));\n\n  if(!areaId){ drawChart(currentRoots); return; }\n\n  function findById(nodes,id){\n    for(const n of nodes){\n      if(n.id===id) return n;\n      const f=findById(n.children,id);\n      if(f) return f;\n    }\n    return null;\n  }\n\n  if(currentRoots.length===1){\n    const areaNode=findById(currentRoots[0].children, areaId);\n    if(areaNode){\n      const fakeRoot={...currentRoots[0], children:[areaNode], assistants: currentRoots[0].assistants};\n      drawChart([fakeRoot]);\n      return;\n    }\n  }\n  const n=findById(currentRoots, areaId);\n  if(n) drawChart([n]);\n}\n\n\nfunction applyLevelFilter(){\n  const levelSel = document.getElementById(\"levelSelect\");\n  if(!levelSel) return;\n  const maxLvl=parseInt(levelSel.value,10);\n\n  const search = document.getElementById(\"searchInput\");\n  const areaSel = document.getElementById(\"areaSelect\");\n  if(search) search.value=\"\";\n  if(areaSel) areaSel.value=\"\";\n\n  document.querySelectorAll(\".node\").forEach(el=> el.classList.remove(\"highlighted\",\"dimmed\"));\n\n  document.querySelectorAll(\".subtree-children\").forEach(el=>{\n    el.style.display=\"\";\n    if(el._vline) el._vline.style.display=\"\";\n  });\n  document.querySelectorAll(\".assistants-below\").forEach(el=> el.style.display=\"\");\n  document.querySelectorAll(\".node .collapse-btn\").forEach(btn=> btn.textContent=\"\u2212\");\n\n  document.querySelectorAll('.subtree-children[data-depth]').forEach(el=>{\n    const d=parseInt(el.getAttribute(\"data-depth\"),10);\n    if(d>maxLvl){\n      el.style.display=\"none\";\n      if(el._vline) el._vline.style.display=\"none\";\n      const parent=el.parentElement;\n      if(parent){\n        const btn=parent.querySelector(':scope .collapse-btn');\n        if(btn) btn.textContent=\"+\";\n      }\n    }\n  });\n}\n\n\nfunction expandAll(){\n  document.querySelectorAll(\".subtree-children\").forEach(el=>{\n    el.style.display=\"\";\n    if(el._vline) el._vline.style.display=\"\";\n  });\n  document.querySelectorAll(\".assistants-below\").forEach(el=> el.style.display=\"\");\n  document.querySelectorAll(\".node .collapse-btn\").forEach(btn=> btn.textContent=\"\u2212\");\n}\n\n\nfunction collapseAll(){\n  document.querySelectorAll(\".subtree-children\").forEach(el=>{\n    el.style.display=\"none\";\n    if(el._vline) el._vline.style.display=\"none\";\n  });\n  document.querySelectorAll(\".assistants-below\").forEach(el=> el.style.display=\"none\");\n  document.querySelectorAll(\".node .collapse-btn\").forEach(btn=> btn.textContent=\"+\");\n}\n\n\nfunction resetFilters(){\n  const search = document.getElementById(\"searchInput\");\n  const areaSel = document.getElementById(\"areaSelect\");\n  const levelSel = document.getElementById(\"levelSelect\");\n  if(search) search.value=\"\";\n  if(areaSel) areaSel.value=\"\";\n  if(levelSel) levelSel.value=\"99\";\n\n  document.querySelectorAll(\".node\").forEach(el=> el.classList.remove(\"highlighted\",\"dimmed\"));\n  expandAll();\n  drawChart(currentRoots);\n}\nfunction toggleDark(){document.body.classList.toggle(\"dark\");var b=document.getElementById(\"darkBtn\");if(b)b.textContent=document.body.classList.contains(\"dark\")?\"Modo claro\":\"Modo escuro\";}\nfunction applyZoom(v){v=Math.min(150,Math.max(10,parseInt(v,10)));var pl=document.getElementById(\"zoomPill\");if(pl)pl.textContent=v+\"%\";var o=document.getElementById(\"orgChart\");if(o)o.style.transform=\"scale(\"+v/100+\")\";}\n(function(){var w=document.getElementById(\"chartWrap\");if(!w)return;var dn=false,sx=0,sy=0,sl=0,st=0,dd=0,dg=false;w.addEventListener(\"mousedown\",function(e){if(e.button!==0||e.target.closest(\"button\")||e.target.closest(\"input\")||e.target.closest(\"select\"))return;dn=true;dg=false;dd=0;w.classList.add(\"dragging\");sx=e.clientX;sy=e.clientY;sl=w.scrollLeft;st=w.scrollTop;});window.addEventListener(\"mousemove\",function(e){if(!dn)return;var dx=e.clientX-sx,dy=e.clientY-sy;dd=Math.max(dd,Math.abs(dx)+Math.abs(dy));if(dd>3)dg=true;w.scrollLeft=sl-dx;w.scrollTop=st-dy;});window.addEventListener(\"mouseup\",function(){dn=false;w.classList.remove(\"dragging\");});w.addEventListener(\"click\",function(e){if(dg){e.preventDefault();e.stopPropagation();dg=false;}},true);w.addEventListener(\"wheel\",function(e){e.preventDefault();var r=document.getElementById(\"zoomRange\");if(!r)return;var z=Math.min(150,Math.max(10,parseInt(r.value||\"100\",10)+(e.deltaY<0?5:-5)));r.value=z;applyZoom(z);},{passive:false});})();\n(function(){try{currentRoots=buildTree(orgData);maxDepth=0;currentRoots.forEach(function(r){calcMaxDepth(r,0);});countsMap=computeCounts(currentRoots);var ac=orgData.filter(function(p){return p.assistente;}).length;var sb=document.getElementById(\"statusBar\");if(sb){var d1=document.createElement(\"div\");d1.className=\"stat\";var s1=document.createElement(\"strong\");s1.textContent=orgData.length;d1.appendChild(s1);d1.appendChild(document.createTextNode(\" pessoas\"));var d2=document.createElement(\"div\");d2.className=\"stat\";var s2=document.createElement(\"strong\");s2.textContent=(orgData.length-ac);d2.appendChild(s2);d2.appendChild(document.createTextNode(\" na hierarquia\"));sb.appendChild(d1);sb.appendChild(d2);}var ls=document.getElementById(\"levelSelect\");if(ls){for(var i=1;i<=maxDepth;i++){var lo=document.createElement(\"option\");lo.value=i;lo.textContent=\"Ate nivel \"+i;ls.appendChild(lo);}}var asel=document.getElementById(\"areaSelect\");if(asel){var ns=(currentRoots.length===1&&currentRoots[0].children.length>0)?currentRoots[0].children:currentRoots;ns.forEach(function(n){var ao=document.createElement(\"option\");ao.value=n.id;ao.textContent=n.nome+\" (\"+(n.cargo||\"-\")+\")\";asel.appendChild(ao);});}drawChart(currentRoots);}catch(err){console.error(\"Init error:\",err);var c=document.getElementById(\"orgChart\");if(c){var ep=document.createElement(\"p\");ep.style.cssText=\"color:red;padding:20px\";ep.textContent=\"Erro: \"+err.message;c.appendChild(ep);}}})();<\\/script></body></html>";
    var html = TMPL.replace("__DATA__", dataStr).replace("__LOGO__", logoTag);
    var blob = new Blob([html], {type: "text/html;charset=utf-8"});
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "organograma_view.html"; a.click();
    URL.revokeObjectURL(url);
  } catch(e) { alert("Erro: " + e.message); console.error(e);
  } finally { if (btn) { btn.innerHTML = orig; btn.disabled = false; } }
}

/* ============================
   EXPORTAR data.json (para GitHub Pages)
============================ */
function exportDataJSON() {
  if (!orgData || !orgData.length) {
    alert("Importe uma base primeiro.");
    return;
  }
  // Export as data.js (script file) to avoid CORS issues on GitHub Pages
  var content = "window.ORG_DATA = " + JSON.stringify(orgData) + "; window.orgData = window.ORG_DATA;";
  var blob = new Blob([content], {type: "application/javascript;charset=utf-8"});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href = url; a.download = "data.js"; a.click();
  URL.revokeObjectURL(url);
  alert("✅ data.js baixado!\n\nAgora suba esse arquivo para o GitHub no lugar do data.json anterior.");
}
