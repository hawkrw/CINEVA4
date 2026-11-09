/* =========================================================
   CINEVA — PERSONAL STREAMING EXPERIENCE
   Profiles, synced progress, recommendations, release alerts
========================================================= */
import { supabase } from "./config.js";

const PROFILE_KEY = userId => `cineva_active_profile:${userId}`;
const FAV_KEY = "cineva_favorites";
const LIST_KEY = "cineva_watchlist";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const posterOf = item => {
  const value = item.poster || item.poster_path || item.image || item.thumbnail || "";
  if (!value) return "/assets/images/movie-placeholder.jpg";
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? `https://image.tmdb.org/t/p/w500${value}` : value;
};
const watchHref = item => `/watch.html?id=${encodeURIComponent(item.content_id ?? item.id)}&type=${item.content_type || "movie"}`;
let user = null, profiles = [], activeProfile = null, currentItem = null;
let progressTimer = null, lastSavedSecond = -1;

async function getProfileContext() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) return false;
  user = authData.user;
  let result = await supabase.from("viewer_profiles").select("*").eq("user_id", user.id).order("slot");
  if (result.error) throw result.error;
  profiles = result.data || [];
  if (!profiles.length) {
    const created = await supabase.from("viewer_profiles").insert({
      user_id: user.id, slot: 1, name: "Main Profile", avatar_emoji: "🍿", is_default: true
    }).select("*").single();
    if (created.error) throw created.error;
    profiles = [created.data];
  }
  const savedId = localStorage.getItem(PROFILE_KEY(user.id));
  activeProfile = profiles.find(p => p.id === savedId) || profiles.find(p => p.is_default) || profiles[0];
  localStorage.setItem(PROFILE_KEY(user.id), activeProfile.id);
  activateLocalLists(activeProfile, true);
  return true;
}

function activateLocalLists(profile, initial = false) {
  const favKey = `${FAV_KEY}:${profile.id}`;
  const listKey = `${LIST_KEY}:${profile.id}`;
  try {
    if (initial && !localStorage.getItem(favKey) && localStorage.getItem(FAV_KEY)) {
      localStorage.setItem(favKey, localStorage.getItem(FAV_KEY));
    }
    if (initial && !localStorage.getItem(listKey) && localStorage.getItem(LIST_KEY)) {
      localStorage.setItem(listKey, localStorage.getItem(LIST_KEY));
    }
    localStorage.setItem(FAV_KEY, localStorage.getItem(favKey) || "[]");
    localStorage.setItem(LIST_KEY, localStorage.getItem(listKey) || "[]");
    window.dispatchEvent(new Event("cineva:favorites-updated"));
    window.dispatchEvent(new Event("cineva:watchlist-updated"));
  } catch (error) { console.warn("CINEVA profile list sync:", error); }
}
function persistLocalLists() {
  if (!activeProfile) return;
  try {
    localStorage.setItem(`${FAV_KEY}:${activeProfile.id}`, localStorage.getItem(FAV_KEY) || "[]");
    localStorage.setItem(`${LIST_KEY}:${activeProfile.id}`, localStorage.getItem(LIST_KEY) || "[]");
  } catch (error) { console.warn("CINEVA profile list save:", error); }
}
window.addEventListener("cineva:favorites-updated", persistLocalLists);
window.addEventListener("cineva:watchlist-updated", persistLocalLists);
window.addEventListener("storage", event => {
  if (event.key === FAV_KEY || event.key === LIST_KEY) persistLocalLists();
});

function ensureOverlay() {
  if (document.getElementById("cinevaProfileOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "cinevaProfileOverlay";
  overlay.className = "cineva-personal-overlay";
  overlay.innerHTML = `
    <section class="cineva-personal-dialog" role="dialog" aria-modal="true" aria-labelledby="cinevaProfilesTitle">
      <button class="cineva-personal-close" type="button" aria-label="Close">×</button>
      <span class="cineva-personal-kicker">YOUR CINEVA SPACE</span>
      <h2 id="cinevaProfilesTitle">Who's watching?</h2>
      <p>Choose a profile to keep favorites and viewing history separate.</p>
      <div class="cineva-profile-choices" id="cinevaProfileChoices"></div>
      <form id="cinevaCreateProfileForm" class="cineva-create-profile">
        <input id="cinevaNewProfileName" maxlength="24" placeholder="New profile name" aria-label="New profile name" required>
        <button type="submit">Add profile</button>
      </form>
      <small class="cineva-profile-limit" id="cinevaProfileLimit">Up to 5 profiles per account.</small>
    </section>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest(".cineva-personal-close")) closeOverlay();
  });
  overlay.querySelector("#cinevaCreateProfileForm").addEventListener("submit", createProfile);
  overlay.querySelector("#cinevaProfileChoices").addEventListener("click", async event => {
    const button = event.target.closest("[data-profile-id]");
    if (!button) return;
    const selected = profiles.find(p => p.id === button.dataset.profileId);
    if (!selected) return;
    persistLocalLists();
    activeProfile = selected;
    localStorage.setItem(PROFILE_KEY(user.id), selected.id);
    activateLocalLists(selected);
    closeOverlay();
    renderProfileBadge();
    await refreshPersonalSections();
  });
}
function closeOverlay() {
  const overlay = document.getElementById("cinevaProfileOverlay");
  overlay?.classList.remove("is-open");
  document.body.classList.remove("cineva-personal-open");
}
function openProfileChooser() {
  ensureOverlay();
  renderProfileChooser();
  const overlay = document.getElementById("cinevaProfileOverlay");
  overlay.classList.add("is-open");
  document.body.classList.add("cineva-personal-open");
}
function renderProfileChooser() {
  const grid = document.getElementById("cinevaProfileChoices");
  if (!grid) return;
  grid.innerHTML = profiles.map(profile => `
    <button type="button" class="cineva-profile-choice ${profile.id === activeProfile?.id ? "is-active" : ""}" data-profile-id="${esc(profile.id)}">
      <span>${esc(profile.avatar_emoji || "🍿")}</span><strong>${esc(profile.name)}</strong>
      ${profile.id === activeProfile?.id ? '<small>Currently active</small>' : ""}
    </button>`).join("");
  const form = document.getElementById("cinevaCreateProfileForm");
  const limit = document.getElementById("cinevaProfileLimit");
  const full = profiles.length >= 5;
  if (form) form.hidden = full;
  if (limit) limit.textContent = full ? "You've reached the 5-profile limit." : `${5 - profiles.length} profile slot(s) available.`;
}
async function createProfile(event) {
  event.preventDefault();
  const input = document.getElementById("cinevaNewProfileName");
  const name = input?.value.trim();
  if (!name || !user || profiles.length >= 5) return;
  const used = new Set(profiles.map(p => p.slot));
  const slot = [1,2,3,4,5].find(value => !used.has(value));
  const emojis = ["🍿","🎬","🌟","🚀","🦁"];
  const { data, error } = await supabase.from("viewer_profiles").insert({
    user_id: user.id, slot, name, avatar_emoji: emojis[slot - 1], is_default: false
  }).select("*").single();
  if (error) { alert(error.message || "Could not create profile."); return; }
  profiles.push(data);
  activeProfile = data;
  localStorage.setItem(PROFILE_KEY(user.id), data.id);
  activateLocalLists(data);
  input.value = "";
  renderProfileChooser();
  renderProfileBadge();
  await refreshPersonalSections();
}
function renderProfileBadge() {
  if (!activeProfile) return;
  let button = document.getElementById("cinevaProfileSwitcher");
  const actions = document.querySelector(".nav-actions");
  if (!button && actions) {
    button = document.createElement("button");
    button.type = "button";
    button.id = "cinevaProfileSwitcher";
    button.className = "cineva-profile-switcher";
    button.setAttribute("aria-label", "Switch viewer profile");
    button.addEventListener("click", openProfileChooser);
    const notification = actions.querySelector("#notificationBtn");
    actions.insertBefore(button, notification || actions.firstChild);
  }
  if (button) button.innerHTML = `<span>${esc(activeProfile.avatar_emoji || "🍿")}</span><small>${esc(activeProfile.name)}</small><i class="fa-solid fa-chevron-down"></i>`;
}

function card(item, progress = null) {
  const poster = posterOf(item);
  const type = item.content_type || "movie";
  const percent = progress && progress.duration_seconds > 0
    ? Math.min(100, Math.max(0, progress.position_seconds / progress.duration_seconds * 100)) : 0;
  return `<a class="cineva-personal-card" href="${esc(watchHref(item))}">
    <span class="cineva-personal-poster"><img src="${esc(poster)}" alt="" loading="lazy" onerror="this.src='/assets/images/movie-placeholder.jpg'">
      <span class="cineva-personal-play"><i class="fa-solid fa-play"></i></span>
      ${progress ? `<span class="cineva-progress-track"><i style="width:${percent.toFixed(1)}%"></i></span>` : ""}
    </span>
    <span class="cineva-personal-card-title">${esc(item.title || "Untitled")}</span>
    <small>${type === "series" ? "SERIES" : "MOVIE"}${item.category ? " · " + esc(item.category) : ""}</small>
  </a>`;
}
function ensureHomeSections() {
  const main = document.querySelector("main");
  const hero = main?.querySelector("#hero-section");
  if (!main || !hero) return;
  if (!document.getElementById("cinevaContinueSection")) {
    hero.insertAdjacentHTML("afterend", `
      <section class="cineva-personal-section container" id="cinevaContinueSection" hidden>
        <div class="cineva-personal-heading"><div><span>YOUR RECENT ACTIVITY</span><h2>Continue Watching</h2><p>Pick up right where you left off.</p></div><a href="/profile.html#dashboard">View activity <i class="fa-solid fa-arrow-right"></i></a></div>
        <div class="cineva-personal-row" id="cinevaContinueGrid"></div>
      </section>
      <section class="cineva-personal-section container" id="cinevaForYouSection" hidden>
        <div class="cineva-personal-heading"><div><span>CURATED FOR YOU</span><h2>Because You Watched</h2><p>Stories selected from your viewing interests.</p></div><a href="/profile.html#dashboard">Your dashboard <i class="fa-solid fa-arrow-right"></i></a></div>
        <div class="cineva-personal-row" id="cinevaForYouGrid"></div>
      </section>`);
  }
}
async function loadContinueAndRecommendations() {
  if (!user || !activeProfile) return;
  const { data: progress, error } = await supabase.from("watch_progress")
    .select("content_type,content_id,title,poster_url,category,position_seconds,duration_seconds,last_watched_at")
    .eq("user_id", user.id).eq("profile_id", activeProfile.id)
    .order("last_watched_at", { ascending: false }).limit(12);
  if (error) { console.warn("CINEVA progress:", error.message); return; }
  const incomplete = (progress || []).filter(p => !p.duration_seconds || p.position_seconds < p.duration_seconds * 0.95);
  const section = document.getElementById("cinevaContinueSection");
  const grid = document.getElementById("cinevaContinueGrid");
  if (section && grid) {
    section.hidden = !incomplete.length;
    grid.innerHTML = incomplete.slice(0,8).map(p => card({...p,id:p.content_id},p)).join("");
  }
  const categories = [...new Set((progress || []).map(p => p.category).filter(Boolean))].slice(0,3);
  const recSection = document.getElementById("cinevaForYouSection");
  const recGrid = document.getElementById("cinevaForYouGrid");
  if (!categories.length || !recSection || !recGrid) return;
  const orFilter = categories.map(c => `category.ilike.${String(c).replace(/[(),.%"]/g," ").trim()}`).filter(c=>!c.endsWith(".")).join(",");
  if (!orFilter) return;
  const [movies, series] = await Promise.all([
    supabase.from("movies").select("id,title,category,poster,poster_path,thumbnail,rating,vote_average").eq("is_active",true).or(orFilter).limit(12),
    supabase.from("series").select("id,title,category,poster,image,poster_path,rating").eq("is_active",true).or(orFilter).limit(12)
  ]);
  if (movies.error || series.error) { console.warn("CINEVA recommendations unavailable"); return; }
  const seen = new Set((progress || []).map(p => `${p.content_type}:${p.content_id}`));
  const results = [
    ...(movies.data || []).map(x=>({...x,content_type:"movie"})),
    ...(series.data || []).map(x=>({...x,content_type:"series"}))
  ].filter(x=>!seen.has(`${x.content_type}:${x.id}`)).slice(0,10);
  recSection.hidden = !results.length;
  recGrid.innerHTML = results.map(x=>card(x)).join("");
}
async function loadAlerts() {
  if (!user || document.getElementById("cinevaReleaseAlertsBtn")) return;
  const actions = document.querySelector(".nav-actions");
  if (!actions) return;
  const button = document.createElement("button");
  button.type = "button"; button.id = "cinevaReleaseAlertsBtn";
  button.className = "cineva-release-alerts"; button.setAttribute("aria-label","Release alerts");
  button.innerHTML = '<i class="fa-solid fa-bell"></i><span class="cineva-alert-dot" hidden></span>';
  actions.insertBefore(button, actions.querySelector("#notificationBtn") || null);
  const panel = document.createElement("div");
  panel.id = "cinevaReleasePanel"; panel.className = "cineva-release-panel";
  panel.innerHTML = '<div class="cineva-release-head"><strong>Your release alerts</strong><button type="button" aria-label="Close">×</button></div><div class="cineva-release-list">Loading alerts...</div>';
  document.body.appendChild(panel);
  const list = panel.querySelector(".cineva-release-list");
  async function refresh() {
    const { data, error } = await supabase.from("user_notifications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(30);
    if (error) { list.textContent = "Alerts are temporarily unavailable."; return; }
    const unread = (data || []).filter(n=>!n.read_at).length;
    button.querySelector(".cineva-alert-dot").hidden = unread === 0;
    list.innerHTML = (data || []).length ? data.map(n=>`<a href="${esc(n.href || "/profile.html#dashboard")}" data-alert-id="${esc(n.id)}" class="${n.read_at ? "" : "is-unread"}"><strong>${esc(n.title)}</strong><span>${esc(n.message)}</span><small>${new Date(n.created_at).toLocaleString()}</small></a>`).join("") : '<p class="cineva-release-empty">No new alerts yet. Follow a series to hear about new episodes.</p>';
  }
  button.addEventListener("click",()=>{panel.classList.toggle("is-open"); if(panel.classList.contains("is-open")) refresh();});
  panel.querySelector("button").addEventListener("click",()=>panel.classList.remove("is-open"));
  list.addEventListener("click",async event=>{
    const link=event.target.closest("[data-alert-id]");
    if(!link) return;
    await supabase.from("user_notifications").update({read_at:new Date().toISOString()}).eq("id",link.dataset.alertId).eq("user_id",user.id);
  });
  await refresh();
}
async function renderWatchDetails() {
  if (!currentItem) return;
  const container = document.querySelector(".watch-details-section");
  if (!container || document.getElementById("cinevaEnhancedDetails")) return;
  const item = currentItem;
  const genres = Array.isArray(item.genres) ? item.genres.map(g=>typeof g==="string"?g:g?.name).filter(Boolean) : String(item.genres || "").split(",").map(s=>s.trim()).filter(Boolean);
  const cast = Array.isArray(item.cast) ? item.cast : Array.isArray(item.credits?.cast) ? item.credits.cast : [];
  const trailerKey = item.trailer_key || item.youtube_trailer_key || "";
  const block = document.createElement("section");
  block.id = "cinevaEnhancedDetails"; block.className = "cineva-enhanced-details";
  block.innerHTML = `
    <div class="cineva-detail-chips">${[item.translator ? "Translator: "+item.translator : "",item.original_title && item.original_title!==item.title ? "Original: "+item.original_title : "",...genres].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join("")}</div>
    ${trailerKey ? `<div class="cineva-trailer"><h3><i class="fa-brands fa-youtube"></i> Official trailer</h3><div><iframe src="https://www.youtube-nocookie.com/embed/${esc(trailerKey)}" title="Trailer for ${esc(item.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div></div>` : ""}
    ${cast.length ? `<div class="cineva-cast"><h3>Cast</h3><div>${cast.slice(0,8).map(person=>`<span><strong>${esc(person.name || person.original_name || "Cast member")}</strong><small>${esc(person.character || "")}</small></span>`).join("")}</div></div>` : ""}
    ${item.translator && item.content_type==="series" ? "" : ""}
    <button type="button" class="cineva-follow-series" id="cinevaFollowSeries" ${item.id && (item.content_type==="series" || new URLSearchParams(location.search).get("type")==="series") ? "" : "hidden"}><i class="fa-regular fa-bell"></i> Follow for new episode alerts</button>`;
  container.appendChild(block);
  const followButton = block.querySelector("#cinevaFollowSeries");
  if (followButton && user && (new URLSearchParams(location.search).get("type")==="series")) {
    const {data:existing}=await supabase.from("series_follows").select("id").eq("user_id",user.id).eq("series_id",item.id).maybeSingle();
    const followed=!!existing;
    const paint=active=>{followButton.classList.toggle("is-following",active);followButton.innerHTML=active?'<i class="fa-solid fa-bell"></i> Following this series':'<i class="fa-regular fa-bell"></i> Follow for new episode alerts';};
    paint(followed);
    followButton.addEventListener("click",async()=>{
      followButton.disabled=true;
      const result=followed
        ? await supabase.from("series_follows").delete().eq("user_id",user.id).eq("series_id",item.id)
        : await supabase.from("series_follows").insert({user_id:user.id,series_id:item.id});
      followButton.disabled=false;
      if(result.error){alert(result.error.message);return;}
      const next=!followed; followed=next; paint(next);
    });
  } else if (followButton) {
    followButton.addEventListener("click",()=>{location.href="/login.html";});
  }
}
async function saveProgress(position, duration) {
  if (!user || !activeProfile || !currentItem?.id) return;
  const positionSeconds=Math.max(0,Math.floor(Number(position)||0));
  const durationSeconds=Math.max(0,Math.floor(Number(duration)||0));
  if (durationSeconds>0 && positionSeconds>=durationSeconds-15) {
    await supabase.from("watch_progress").delete().eq("user_id",user.id).eq("profile_id",activeProfile.id).eq("content_type",currentItem.content_type).eq("content_id",String(currentItem.id));
    return;
  }
  const record={
    user_id:user.id,profile_id:activeProfile.id,content_type:currentItem.content_type,
    content_id:String(currentItem.id),title:currentItem.title || "Untitled",
    poster_url:posterOf(currentItem),category:currentItem.category || null,
    position_seconds:positionSeconds,duration_seconds:durationSeconds,last_watched_at:new Date().toISOString()
  };
  const {error}=await supabase.from("watch_progress").upsert(record,{onConflict:"profile_id,content_type,content_id"});
  if(error) console.warn("CINEVA watch progress not saved:",error.message);
}
function setupProgressTracking() {
  const video=document.getElementById("video-player");
  if(!video) return;
  video.addEventListener("loadedmetadata",async()=>{
    if(!currentItem || !user || !activeProfile) return;
    const {data}=await supabase.from("watch_progress").select("position_seconds").eq("user_id",user.id).eq("profile_id",activeProfile.id).eq("content_type",currentItem.content_type).eq("content_id",String(currentItem.id)).maybeSingle();
    if(data?.position_seconds>5 && Number.isFinite(video.duration) && video.duration>data.position_seconds+10) {
      video.currentTime=data.position_seconds;
    }
    saveProgress(video.currentTime,video.duration);
  });
  video.addEventListener("timeupdate",()=>{
    if(!currentItem || !user || !activeProfile) return;
    const second=Math.floor(video.currentTime||0);
    if(second-lastSavedSecond<10) return;
    lastSavedSecond=second;
    clearTimeout(progressTimer);
    progressTimer=setTimeout(()=>saveProgress(video.currentTime,video.duration),1200);
  });
  video.addEventListener("pause",()=>saveProgress(video.currentTime,video.duration));
  window.addEventListener("pagehide",()=>{ if(video.duration) saveProgress(video.currentTime,video.duration); });
}
async function renderProfileDashboard() {
  const host=document.getElementById("cinevaPersonalDashboard");
  if(!host || !user || !activeProfile) return;
  const {data,error}=await supabase.from("watch_progress").select("content_type,content_id,title,category,position_seconds,duration_seconds,last_watched_at").eq("user_id",user.id).eq("profile_id",activeProfile.id).order("last_watched_at",{ascending:false}).limit(100);
  if(error){host.innerHTML='<p>Viewing statistics are temporarily unavailable.</p>';return;}
  const rows=data||[];
  const seconds=rows.reduce((sum,r)=>sum+Math.min(r.position_seconds||0,r.duration_seconds||r.position_seconds||0),0);
  const categories={}; rows.forEach(r=>{if(r.category)categories[r.category]=(categories[r.category]||0)+1;});
  const top=Object.entries(categories).sort((a,b)=>b[1]-a[1])[0]?.[0]||"Not enough data";
  const hours=(seconds/3600).toFixed(1);
  host.innerHTML=`<div class="cineva-dashboard-stats"><article><span>Titles watched</span><strong>${rows.length}</strong></article><article><span>Watch time</span><strong>${hours}h</strong></article><article><span>Top category</span><strong>${esc(top)}</strong></article></div><div class="cineva-dashboard-history"><h3>Recently watched</h3>${rows.slice(0,8).map(r=>`<div><span>${esc(r.title)}</span><small>${new Date(r.last_watched_at).toLocaleDateString()}</small></div>`).join("") || "<p>Your viewing history will appear here.</p>"}</div>`;
}
function renderProfileManager() {
  const host=document.getElementById("cinevaProfileManager");
  if(!host || !user) return;
  host.innerHTML=`<div class="cineva-profile-manager-grid">${profiles.map(p=>`<article class="${p.id===activeProfile.id?"is-active":""}"><span>${esc(p.avatar_emoji)}</span><strong>${esc(p.name)}</strong><small>${p.id===activeProfile.id?"Active profile":"Viewer profile"}</small><button type="button" data-manage-profile="${esc(p.id)}">Switch profile</button></article>`).join("")}</div><form id="cinevaInlineProfileForm" class="cineva-create-profile" ${profiles.length>=5?"hidden":""}><input name="name" maxlength="24" placeholder="Create another profile" required><button type="submit">Create profile</button></form>`;
  host.querySelectorAll("[data-manage-profile]").forEach(button=>button.addEventListener("click",async()=>{
    const selected=profiles.find(p=>p.id===button.dataset.manageProfile); if(!selected)return;
    persistLocalLists(); activeProfile=selected; localStorage.setItem(PROFILE_KEY(user.id),selected.id); activateLocalLists(selected);
    renderProfileBadge(); await refreshPersonalSections();
  }));
  host.querySelector("#cinevaInlineProfileForm")?.addEventListener("submit",async event=>{
    event.preventDefault(); const input=event.currentTarget.elements.name; const name=input.value.trim();
    if(!name||profiles.length>=5)return;
    const used=new Set(profiles.map(p=>p.slot)); const slot=[1,2,3,4,5].find(n=>!used.has(n));
    const {data,error}=await supabase.from("viewer_profiles").insert({user_id:user.id,slot,name,avatar_emoji:["🍿","🎬","🌟","🚀","🦁"][slot-1]}).select("*").single();
    if(error){alert(error.message);return;} profiles.push(data); persistLocalLists(); activeProfile=data; localStorage.setItem(PROFILE_KEY(user.id),data.id); activateLocalLists(data); await refreshPersonalSections();
  });
}
async function refreshPersonalSections() {
  await Promise.all([loadContinueAndRecommendations(),renderProfileDashboard()]);
  renderProfileManager();
}
function initializeWatchPageExperience() {
  const type=new URLSearchParams(location.search).get("type")==="series"?"series":"movie";
  window.addEventListener("cineva:content-ready",event=>{
    currentItem={...event.detail.item,content_type:event.detail.contentType||type};
    renderWatchDetails();
    if (currentItem && user && activeProfile) saveProgress(0,0);
  });
  setupProgressTracking();
}
async function initialize() {
  try {
    const authenticated=await getProfileContext();
    if (!authenticated) return;
    renderProfileBadge();
    loadAlerts();
    ensureHomeSections();
    await refreshPersonalSections();
    if(document.querySelector("#watch-content")) initializeWatchPageExperience();
  } catch(error) { console.warn("CINEVA personal experience:",error); }
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initialize,{once:true});
else initialize();
