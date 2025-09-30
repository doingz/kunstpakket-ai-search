// Auto-generated widget bundle - DO NOT EDIT
// Run: npm run build && copy dist/widget.js content here as a string
export const WIDGET_CODE = String.raw`(()=>{var v="https://frederique-ai.lotapi.workers.dev/search",p=async t=>{let e=await fetch(v,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:t})});if(!e.ok)throw new Error(\`Search failed: \${e.status}\`);let i=await e.json();return{answer:i.answer||i.result?.answer||"",products:k(i.result?.products||i.products||[])}},k=t=>t.map(e=>({id:e.id,title:e.title||e.fulltitle||"Untitled",price:e.price||e.discountPrice||"0.00",image:e.image||e.imageUrl||"",url:e.url||\`/product/\${e.id}\`})).slice(0,8);var a=null,o=null,d=null,s=null,m=()=>{a=document.createElement("div"),a.className="kp-ai-widget__overlay",o=document.createElement("div"),o.className="kp-ai-widget__modal",o.innerHTML=\`
    <div class="kp-ai-widget__header">
      <input 
        type="text" 
        class="kp-ai-widget__input" 
        placeholder="Zoek bijvoorbeeld: schilderij voor budget €50..."
        autofocus
      />
      <button class="kp-ai-widget__close" aria-label="Sluiten">×</button>
    </div>
    <div class="kp-ai-widget__body"></div>
  \`,a.appendChild(o),document.body.appendChild(a),d=o.querySelector(".kp-ai-widget__body"),s=o.querySelector(".kp-ai-widget__input"),s.addEventListener("input",t=>_(t.target.value)),o.querySelector(".kp-ai-widget__close").addEventListener("click",l),a.addEventListener("click",t=>{t.target===a&&l()}),setTimeout(()=>s.focus(),100)},g=()=>{d&&(d.innerHTML=\`
    <div class="kp-ai-widget__loading">
      <div class="kp-ai-widget__spinner"></div>
      <p>Aan het zoeken...</p>
    </div>
  \`)},c=({answer:t,products:e})=>{if(!d)return;let i="";t&&(i+=\`
      <div class="kp-ai-widget__answer">
        <p>\${n(t)}</p>
      </div>
    \`),e?.length?(i+='<div class="kp-ai-widget__products">',e.forEach(r=>{i+=\`
        <a href="\${n(r.url)}" class="kp-ai-widget__product">
          \${r.image?\\\`<img src="\${n(r.image)}" alt="\${n(r.title)}" class="kp-ai-widget__product-img" loading="lazy">\\\`:""}
          <div class="kp-ai-widget__product-info">
            <h3 class="kp-ai-widget__product-title">\${n(r.title)}</h3>
            <p class="kp-ai-widget__product-price">€\${n(r.price)}</p>
          </div>
        </a>
      \`}),i+="</div>"):t||(i+=\`
      <div class="kp-ai-widget__empty">
        <p>Geen resultaten gevonden. Probeer een andere zoekopdracht.</p>
      </div>
    \`),d.innerHTML=i},l=()=>{a?.remove(),a=null,o=null,d=null,s=null},n=t=>{let e=document.createElement("div");return e.textContent=t,e.innerHTML};var h=null,u=()=>{let t=document.createElement("style");t.textContent=".kp-ai-widget__overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:20px;animation:fadeIn .2s ease}@media(min-width: 768px){.kp-ai-widget__overlay{padding:80px 20px 20px}}.kp-ai-widget__modal{background:#fff;border-radius:12px;box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 10px 10px -5px rgba(0,0,0,.04);width:100%;max-width:800px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;animation:slideUp .3s ease}.kp-ai-widget__header{padding:20px;border-bottom:1px solid #e5e7eb;display:flex;gap:12px;align-items:center}.kp-ai-widget__input{flex:1;border:none;font-size:16px;outline:none}.kp-ai-widget__input::placeholder{color:#9ca3af}.kp-ai-widget__close{background:none;border:none;font-size:24px;color:#6b7280;cursor:pointer;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:6px;transition:background .2s}.kp-ai-widget__close:hover{background:#f3f4f6}.kp-ai-widget__body{flex:1;overflow-y:auto;padding:20px}.kp-ai-widget__loading{text-align:center;padding:40px;color:#6b7280}.kp-ai-widget__spinner{width:40px;height:40px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}.kp-ai-widget__answer{background:#f0f9ff;border-left:4px solid #2563eb;padding:16px;margin-bottom:24px;border-radius:8px}.kp-ai-widget__answer p{margin:0;line-height:1.6;color:#1e293b}.kp-ai-widget__products{display:grid;grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));gap:16px}@media(min-width: 640px){.kp-ai-widget__products{grid-template-columns:repeat(auto-fill, minmax(200px, 1fr))}}.kp-ai-widget__product{display:block;text-decoration:none;color:inherit;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;transition:transform .2s,box-shadow .2s}.kp-ai-widget__product:hover{transform:translateY(-2px);box-shadow:0 4px 6px -1px rgba(0,0,0,.1)}.kp-ai-widget__product-img{width:100%;aspect-ratio:1;object-fit:cover;background:#f9fafb}.kp-ai-widget__product-info{padding:12px}.kp-ai-widget__product-title{font-size:14px;font-weight:500;line-height:1.4;margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.kp-ai-widget__product-price{font-size:16px;font-weight:600;color:#2563eb}.kp-ai-widget__empty{text-align:center;padding:60px 20px;color:#6b7280}.kp-ai-widget__empty svg{width:48px;height:48px;margin:0 auto 16px;opacity:.5}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}",document.head.appendChild(t);let e=document.querySelector("#formSearch"),i=document.querySelector("#nav .search"),r=w=>{w?.preventDefault(),m()};e?.addEventListener("click",r),i?.addEventListener("click",r)},_=t=>{if(clearTimeout(h),!t.trim()){l();return}g(),h=setTimeout(async()=>{try{let e=await p(t);c(e)}catch(e){console.error("Search error:",e),c({answer:"Er ging iets mis. Probeer het opnieuw.",products:[]})}},300)};var f=()=>{let t=sessionStorage.getItem("kp_widget_enabled");return new URLSearchParams(window.location.search).get("f")==="1"?(sessionStorage.setItem("kp_widget_enabled","1"),!0):t==="1"};f()&&(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",u):u());})();`;
