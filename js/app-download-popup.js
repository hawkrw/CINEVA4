(() => {
"use strict";
if (window.__CINEVA_APP_DOWNLOAD_POPUP__) return;
// Native CINEVA app: never show the install prompt inside an installed app.
const capacitor = window.Capacitor;
const isNativeApp = Boolean(capacitor && (
    (typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform()) ||
    (typeof capacitor.getPlatform === "function" && capacitor.getPlatform() !== "web")
));
if (isNativeApp) return;
window.__CINEVA_APP_DOWNLOAD_POPUP__ = true;
const REPO = "hawkrw/CINEVA4";
const RELEASE_API = "https://api.github.com/repos/" + REPO + "/releases/tags/cineva-android-latest";
const ACTIONS_URL = "https://github.com/" + REPO + "/actions/workflows/build-android.yml";
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const style = document.createElement("style");
style.textContent = ".cv-app-backdrop{position:fixed;inset:0;z-index:999990;background:rgba(3,3,12,.76);backdrop-filter:blur(9px);display:flex;align-items:center;justify-content:center;padding:18px;opacity:0;visibility:hidden;transition:opacity .25s ease,visibility .25s ease}.cv-app-backdrop.cv-open{opacity:1;visibility:visible}.cv-app-dialog{position:relative;width:min(100%,430px);overflow:hidden;border:1px solid rgba(168,85,247,.34);border-radius:24px;background:linear-gradient(145deg,#171326 0%,#0d0d19 58%,#10101e 100%);box-shadow:0 28px 90px rgba(0,0,0,.58);color:#fff;font-family:inherit;transform:translateY(18px) scale(.98);transition:transform .28s ease}.cv-app-backdrop.cv-open .cv-app-dialog{transform:translateY(0) scale(1)}.cv-app-top{height:5px;background:linear-gradient(90deg,#ef315e,#8b35f5,#a855f7)}.cv-app-inner{padding:27px 25px 24px;text-align:center}.cv-app-close{position:absolute;right:14px;top:15px;width:34px;height:34px;border:1px solid rgba(255,255,255,.12);border-radius:50%;background:rgba(255,255,255,.07);color:#fff;font-size:21px;line-height:1;cursor:pointer}.cv-app-logo{width:76px;height:76px;margin:2px auto 15px;border-radius:21px;display:grid;place-items:center;background:linear-gradient(145deg,#8b35f5,#ef315e);box-shadow:0 10px 35px rgba(139,53,245,.3);overflow:hidden}.cv-app-logo img{width:100%;height:100%;object-fit:cover}.cv-app-eyebrow{font-size:10px;letter-spacing:2.2px;font-weight:800;color:#c69cff;text-transform:uppercase;margin:0 0 8px}.cv-app-title{font-size:25px;line-height:1.15;font-weight:900;letter-spacing:-.6px;margin:0 0 9px;color:#fff}.cv-app-title span{background:linear-gradient(90deg,#ef6690,#ad7aff);-webkit-background-clip:text;background-clip:text;color:transparent}.cv-app-desc{font-size:13px;line-height:1.65;color:#b9b5c8;margin:0 auto 19px;max-width:330px}.cv-app-status{display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;color:#c8c1d7;margin:0 0 16px;min-height:17px}.cv-app-dot{width:7px;height:7px;border-radius:50%;background:#a855f7;box-shadow:0 0 10px #a855f7}.cv-app-actions{display:grid;gap:10px}.cv-app-primary,.cv-app-secondary{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:48px;padding:12px 16px;border-radius:13px;text-decoration:none;font-size:13px;font-weight:800;cursor:pointer;box-sizing:border-box}.cv-app-primary{border:0;color:#fff;background:linear-gradient(100deg,#8b35f5,#ef315e);box-shadow:0 8px 24px rgba(139,53,245,.25)}.cv-app-secondary{border:1px solid rgba(255,255,255,.13);color:#e7e1f2;background:rgba(255,255,255,.045)}.cv-app-help{font-size:11px;color:#b7aecb;line-height:1.55;margin:12px 0 0}.cv-app-meta{font-size:10px;color:#777287;margin:14px 0 0;line-height:1.5}@media(max-width:480px){.cv-app-backdrop{padding:14px}.cv-app-inner{padding:25px 20px 21px}.cv-app-title{font-size:23px}.cv-app-dialog{border-radius:21px}}@media(prefers-reduced-motion:reduce){.cv-app-backdrop,.cv-app-dialog{transition:none}}";
document.head.appendChild(style);
const backdrop = document.createElement("div");
backdrop.className = "cv-app-backdrop";
backdrop.id = "cinevaAppDownloadPopup";
backdrop.setAttribute("role","dialog");
backdrop.setAttribute("aria-modal","true");
backdrop.setAttribute("aria-labelledby","cvAppTitle");
backdrop.innerHTML = [
'<section class="cv-app-dialog"><div class="cv-app-top"></div>',
'<button class="cv-app-close" type="button" aria-label="Close app download popup">&times;</button>',
'<div class="cv-app-inner"><div class="cv-app-logo"><img src="/assets/images/logo.png" alt="CINEVA" onerror="this.style.display=\'none\';this.parentNode.textContent=\'C\'"></div>',
'<p class="cv-app-eyebrow">Your entertainment, one tap away</p>',
'<h2 class="cv-app-title" id="cvAppTitle">Get the <span>CINEVA App</span></h2>',
'<p class="cv-app-desc">Enjoy a smoother, app-like CINEVA experience. Get the latest Android build or add CINEVA to your iPhone home screen.</p>',
'<div class="cv-app-status" id="cvAppStatus"><i class="cv-app-dot"></i><span>Checking the latest app build…</span></div>',
'<div class="cv-app-actions" id="cvAppActions"><a class="cv-app-primary" href="',ACTIONS_URL,'" target="_blank" rel="noopener">View Android app builds</a>',
'<button class="cv-app-secondary" type="button">Continue on CINEVA</button></div>',
'<p class="cv-app-help" id="cvAppHelp"></p><p class="cv-app-meta" id="cvAppMeta">Official CINEVA build information is fetched from GitHub automatically.</p></div></section>'
].join("");
document.body.appendChild(backdrop);
const status = backdrop.querySelector("#cvAppStatus");
const actions = backdrop.querySelector("#cvAppActions");
const help = backdrop.querySelector("#cvAppHelp");
const meta = backdrop.querySelector("#cvAppMeta");
function closePopup(){backdrop.classList.remove("cv-open");document.body.style.removeProperty("overflow");}
backdrop.querySelector(".cv-app-close").addEventListener("click",closePopup);
backdrop.querySelector(".cv-app-secondary").addEventListener("click",closePopup);
backdrop.addEventListener("click",e=>{if(e.target===backdrop)closePopup();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&backdrop.classList.contains("cv-open"))closePopup();});
function showPopup(){backdrop.classList.add("cv-open");document.body.style.overflow="hidden";}
function setStatus(message){status.innerHTML='<i class="cv-app-dot"></i><span></span>';status.querySelector("span").textContent=message;}
function setPrimary(url,label){
actions.innerHTML="";
const link=document.createElement("a");link.className="cv-app-primary";link.href=url;link.textContent=label;link.target="_blank";link.rel="noopener";actions.appendChild(link);
const button=document.createElement("button");button.className="cv-app-secondary";button.type="button";button.textContent="Continue on CINEVA";button.addEventListener("click",closePopup);actions.appendChild(button);
}
function formatDate(value){return value?new Date(value).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"Date unavailable";}
async function loadLatestBuild(){
try{
const response=await fetch(RELEASE_API,{headers:{Accept:"application/vnd.github+json"},cache:"no-store"});
if(response.status===404){
setStatus("The first public APK release is still being prepared");
setPrimary(ACTIONS_URL,"View Android build progress");
help.textContent="The APK download will appear here automatically after the next successful build.";
meta.textContent="No public APK release has been published yet.";
return;
}
if(!response.ok)throw new Error("Public release lookup returned "+response.status);
const release=await response.json();
const asset=(release.assets||[]).find(item=>item.name==="app-debug.apk"&&item.state==="uploaded");
if(!asset){
setStatus("Latest release found, but APK file is not attached");
setPrimary(release.html_url||ACTIONS_URL,"View CINEVA release");
meta.textContent="The build workflow will attach the APK when it completes.";
return;
}
setStatus("Latest Android APK is ready");
if(IOS){
setPrimary("https://cineva4.djhawkrw.workers.dev/","Open CINEVA");
help.textContent="On iPhone: open this site in Safari, tap Share, then choose “Add to Home Screen”. A signed iOS IPA is not currently published.";
}else{
setPrimary(asset.browser_download_url,"Download Android APK");
help.textContent="This is a direct public APK download. When it finishes, open the file and follow Android's install prompt.";
}
meta.textContent="Published "+formatDate(release.published_at||release.created_at)+" · "+Math.max(1,Math.round((asset.size||0)/1024/1024))+" MB · "+(release.tag_name||"Latest release");
}catch(error){
console.warn("CINEVA public APK details could not be fetched:",error);
setStatus("APK details are temporarily unavailable");
setPrimary(ACTIONS_URL,"Open official app builds");
help.textContent=IOS?"On iPhone, use Safari → Share → Add to Home Screen to install CINEVA.":"The download link will update automatically once the public APK release is available.";
meta.textContent="This popup uses the public CINEVA release feed and does not require GitHub sign-in.";
}
}
loadLatestBuild();
window.setTimeout(showPopup,350);
})();