import { supabase } from "../../js/config.js";

const $ = id => document.getElementById(id);
let profiles = [];
let modal = null;

async function getImageKitAuth() {
    const { data, error } = await supabase.functions.invoke("imagekit-upload-auth", { method: "POST" });
    if (error) throw new Error(error.message || "Could not authorize the ImageKit upload.");
    if (!data?.token || !data?.signature || !data?.publicKey) {
        throw new Error(data?.error || "ImageKit upload authentication is not configured.");
    }
    return data;
}

async function uploadTranslatorImage(file, translatorName) {
    const auth = await getImageKitAuth();
    const safeName = String(translatorName || "translator").normalize("NFKD")
        .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55) || "translator";
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const form = new FormData();
    form.append("file", file);
    form.append("fileName", safeName + "-" + Date.now() + "." + extension);
    form.append("publicKey", auth.publicKey);
    form.append("token", auth.token);
    form.append("expire", String(auth.expire));
    form.append("signature", auth.signature);
    form.append("folder", "/cineva/translator-profiles");
    form.append("useUniqueFileName", "true");
    const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.message || "ImageKit upload failed (HTTP " + response.status + ").");
    return result.url;
}

function setMessage(message, isError = false) {
    const node = $("translatorProfileMessage");
    if (!node) return;
    node.textContent = message || "";
    node.style.color = isError ? "#ff9cab" : "#8fe0bc";
}

function renderProfiles() {
    const grid = $("translatorProfileGrid");
    const summary = $("translatorProfileSummary");
    if (!grid) return;

    const query = ($("translatorProfileSearch")?.value || "").trim().toLowerCase();
    const visible = profiles.filter(profile =>
        String(profile.name || "").toLowerCase().includes(query)
    );

    if (summary) {
        const active = profiles.filter(profile => profile.is_active).length;
        const legacyPhotos = profiles.filter(profile => profile.profile_image_url && !/ik\.imagekit\.io|imagekit\.io/i.test(profile.profile_image_url)).length;
        const migrateButton = $("migrateTranslatorImages");
        if (migrateButton && !migrateButton.disabled) migrateButton.textContent = legacyPhotos ? "Move " + legacyPhotos + " old photo" + (legacyPhotos === 1 ? "" : "s") + " to ImageKit" : "All photos on ImageKit";
        summary.textContent = profiles.length + " profiles · " + active + " active · " + (profiles.length - active) + " hidden";
    }

    grid.replaceChildren();
    if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "category-empty";
        empty.textContent = query ? "No translator profiles match your search." : "No translator profiles yet. Add the first translator profile.";
        grid.appendChild(empty);
        return;
    }

    visible.forEach(profile => {
        const card = document.createElement("article");
        card.className = "translator-admin-card";

        const top = document.createElement("div");
        top.className = "translator-admin-card-top";

        const photo = document.createElement("div");
        photo.className = "translator-admin-photo";
        if (profile.profile_image_url) {
            const image = document.createElement("img");
            image.src = profile.profile_image_url;
            image.alt = profile.name;
            image.loading = "lazy";
            image.onerror = () => {
                image.remove();
                photo.textContent = (profile.name || "?").trim().charAt(0).toUpperCase();
            };
            photo.appendChild(image);
        } else {
            photo.textContent = (profile.name || "?").trim().charAt(0).toUpperCase();
        }

        const identity = document.createElement("div");
        identity.className = "translator-admin-identity";
        const name = document.createElement("strong");
        name.textContent = profile.name;
        const bio = document.createElement("span");
        bio.textContent = profile.bio || "CINEVA Translator";
        identity.append(name, bio);
        top.append(photo, identity);

        const status = document.createElement("div");
        status.className = "translator-admin-status" + (profile.is_active ? "" : " inactive");
        status.textContent = profile.is_active ? "● Visible on homepage" : "● Hidden from homepage";

        const actions = document.createElement("div");
        actions.className = "translator-admin-card-actions";
        [
            ["Edit", "edit", ""],
            [profile.is_active ? "Hide" : "Show", "toggle", ""],
            ["Delete", "delete", "danger"]
        ].forEach(([label, action, className]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.dataset.translatorAction = action;
            button.dataset.id = profile.id;
            if (className) button.classList.add(className);
            actions.appendChild(button);
        });

        card.append(top, status, actions);
        grid.appendChild(card);
    });
}

async function loadProfiles() {
    const grid = $("translatorProfileGrid");
    if (grid) {
        grid.replaceChildren();
        const loading = document.createElement("div");
        loading.className = "category-loading";
        loading.textContent = "Loading translator profiles...";
        grid.appendChild(loading);
    }

    const { data, error } = await supabase
        .from("translator_profiles")
        .select("id,name,profile_image_url,bio,sort_order,is_active,created_at")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    if (error) {
        console.error("CINEVA translator profile load failed:", error);
        if (grid) {
            grid.replaceChildren();
            const message = document.createElement("div");
            message.className = "category-empty";
            message.textContent = "Unable to load translator profiles. Check administrator access and refresh.";
            grid.appendChild(message);
        }
        throw error;
    }

    profiles = data || [];
    renderProfiles();
}

function ensureModal() {
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "platform-modal-backdrop";
    modal.hidden = true;
    modal.innerHTML = `
        <section class="platform-modal-card translator-profile-modal" role="dialog" aria-modal="true" aria-labelledby="translatorModalTitle">
            <div class="platform-modal-heading">
                <div>
                    <span class="admin-eyebrow">CINEVA CREATOR DIRECTORY</span>
                    <h2 id="translatorModalTitle">Add Translator</h2>
                    <p>Upload a profile portrait and control how this translator appears on CINEVA.</p>
                </div>
                <button type="button" class="platform-modal-close" data-close-translator aria-label="Close">×</button>
            </div>
            <form id="translatorProfileForm">
                <input type="hidden" name="id">
                <div class="translator-upload-row">
                    <div class="translator-upload-preview" id="translatorUploadPreview">T</div>
                    <label class="platform-field">Profile photo
                        <input type="file" id="translatorProfileFile" accept="image/jpeg,image/png,image/webp">
                    </label>
                </div>
                <label class="platform-field">Translator name
                    <input name="name" maxlength="80" required placeholder="Enter translator name">
                </label>
                <label class="platform-field">Profile image URL <span>(filled automatically after upload; you can also paste a URL)</span>
                    <input name="profile_image_url" type="url" placeholder="https://...">
                </label>
                <label class="platform-field">Short description <span>(optional)</span>
                    <textarea name="bio" rows="3" maxlength="180" placeholder="A short introduction for this translator"></textarea>
                </label>
                <label class="platform-field">Display order
                    <input name="sort_order" type="number" min="0" step="1" value="0">
                </label>
                <label class="translator-checkbox"><input name="is_active" type="checkbox" checked> Show this translator on the homepage</label>
                <p class="platform-form-message" id="translatorProfileMessage" role="status"></p>
                <div class="platform-modal-actions">
                    <button type="button" class="platform-secondary-btn" data-close-translator>Cancel</button>
                    <button type="submit" class="primary-btn" id="saveTranslatorProfile">Save Profile</button>
                </div>
            </form>
        </section>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll("[data-close-translator]").forEach(button =>
        button.addEventListener("click", closeModal)
    );
    modal.addEventListener("pointerdown", event => {
        if (event.target === modal) closeModal();
    });
    modal.querySelector("#translatorProfileForm").addEventListener("submit", saveProfile);
    modal.querySelector("#translatorProfileFile").addEventListener("change", uploadProfileImage);
    modal.querySelector('[name="profile_image_url"]').addEventListener("input", updatePreview);
    modal.querySelector('[name="name"]').addEventListener("input", updatePreview);
    return modal;
}

function updatePreview() {
    const preview = $("translatorUploadPreview");
    const url = modal?.querySelector('[name="profile_image_url"]')?.value.trim();
    const name = modal?.querySelector('[name="name"]')?.value.trim() || "T";
    if (!preview) return;
    preview.replaceChildren();

    if (url) {
        const image = document.createElement("img");
        image.src = url;
        image.alt = name + " profile preview";
        image.onerror = () => { preview.textContent = name.charAt(0).toUpperCase(); };
        preview.appendChild(image);
    } else {
        preview.textContent = name.charAt(0).toUpperCase();
    }
}

async function uploadProfileImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setMessage("Choose a JPG, PNG or WebP image.", true);
        event.target.value = "";
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        setMessage("Profile images must be 5 MB or smaller.", true);
        event.target.value = "";
        return;
    }

    setMessage("Uploading profile photo to ImageKit...");
    try {
        const translatorName = modal.querySelector('[name="name"]').value.trim() || file.name;
        const imageUrl = await uploadTranslatorImage(file, translatorName);
        modal.querySelector('[name="profile_image_url"]').value = imageUrl;
    } catch (error) {
        console.error("Translator profile photo upload failed:", error);
        setMessage("Photo upload failed: " + error.message, true);
        return;
    }
    updatePreview();
    setMessage("Profile photo uploaded. Save the profile to publish it.");
}

function openModal(profile = null) {
    ensureModal();
    const form = modal.querySelector("#translatorProfileForm");
    form.reset();
    form.elements.namedItem("id").value = profile?.id || "";
    form.elements.namedItem("name").value = profile?.name || "";
    form.elements.namedItem("profile_image_url").value = profile?.profile_image_url || "";
    form.elements.namedItem("bio").value = profile?.bio || "";
    form.elements.namedItem("sort_order").value = profile?.sort_order ?? profiles.length;
    form.elements.namedItem("is_active").checked = profile ? profile.is_active : true;
    $("translatorModalTitle").textContent = profile ? "Edit Translator" : "Add Translator";
    $("saveTranslatorProfile").textContent = profile ? "Update Profile" : "Create Profile";
    $("translatorProfileFile").value = "";
    setMessage("");
    updatePreview();
    modal.hidden = false;
    document.body.classList.add("platform-modal-open");
    form.elements.namedItem("name").focus();
}

function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("platform-modal-open");
}

async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("saveTranslatorProfile");
    const id = form.elements.namedItem("id").value;
    const name = form.elements.namedItem("name").value.trim().replace(/\s+/g, " ");
    const imageUrl = form.elements.namedItem("profile_image_url").value.trim();
    const bio = form.elements.namedItem("bio").value.trim();
    const order = Number(form.elements.namedItem("sort_order").value || 0);
    const isActive = form.elements.namedItem("is_active").checked;

    if (!name) return setMessage("Translator name is required.", true);
    if (!Number.isInteger(order) || order < 0) return setMessage("Display order must be a non-negative whole number.", true);

    button.disabled = true;
    button.textContent = "Saving...";
    const payload = {
        name,
        profile_image_url: imageUrl || null,
        bio: bio || null,
        sort_order: order,
        is_active: isActive,
        updated_at: new Date().toISOString()
    };

    try {
        const response = id
            ? await supabase.from("translator_profiles").update(payload).eq("id", id)
            : await supabase.from("translator_profiles").insert(payload);
        if (response.error) throw response.error;
        closeModal();
        await loadProfiles();
    } catch (error) {
        console.error("Translator profile save failed:", error);
        setMessage(error.message || "Unable to save this translator profile.", true);
    } finally {
        button.disabled = false;
        button.textContent = id ? "Update Profile" : "Create Profile";
    }
}

async function handleProfileAction(event) {
    const button = event.target.closest("[data-translator-action]");
    if (!button) return;
    const profile = profiles.find(item => String(item.id) === String(button.dataset.id));
    if (!profile) return;

    const action = button.dataset.translatorAction;
    button.disabled = true;
    try {
        if (action === "edit") {
            openModal(profile);
        } else if (action === "toggle") {
            const { error } = await supabase.from("translator_profiles")
                .update({ is_active: !profile.is_active, updated_at: new Date().toISOString() })
                .eq("id", profile.id);
            if (error) throw error;
            await loadProfiles();
        } else if (action === "delete") {
            if (!confirm("Delete the profile for " + profile.name + "? This will not delete any movies or series.")) return;
            const { error } = await supabase.from("translator_profiles").delete().eq("id", profile.id);
            if (error) throw error;
            await loadProfiles();
        }
    } catch (error) {
        console.error("Translator profile action failed:", error);
        alert(error.message || "Unable to update this translator profile.");
    } finally {
        button.disabled = false;
    }
}

async function migrateLegacyImages() {
    const candidates = profiles.filter(profile => profile.profile_image_url && !/ik\.imagekit\.io|imagekit\.io/i.test(profile.profile_image_url));
    if (!candidates.length) { alert("All existing translator profile photos are already stored on ImageKit."); return; }
    if (!confirm("Move " + candidates.length + " existing translator photo(s) to ImageKit? Each profile URL will be updated only after its new ImageKit upload succeeds. Original Supabase files will be kept as a safe backup.")) return;
    const button = $("migrateTranslatorImages");
    if (button) { button.disabled = true; button.textContent = "Migrating photos..."; }
    let moved = 0;
    const failures = [];
    try {
        for (const profile of candidates) {
            try {
                const response = await fetch(profile.profile_image_url, { mode: "cors", cache: "no-store" });
                if (!response.ok) throw new Error("Could not download current photo (HTTP " + response.status + ").");
                const blob = await response.blob();
                if (!blob.type.startsWith("image/")) throw new Error("The current URL did not return an image.");
                const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
                const file = new File([blob], profile.name + "." + ext, { type: blob.type });
                const imageUrl = await uploadTranslatorImage(file, profile.name);
                const { error } = await supabase.from("translator_profiles").update({
                    profile_image_url: imageUrl, updated_at: new Date().toISOString()
                }).eq("id", profile.id);
                if (error) throw error;
                profile.profile_image_url = imageUrl;
                moved++;
                if (button) button.textContent = "Migrating " + moved + "/" + candidates.length + "...";
            } catch (error) {
                console.error("Translator photo migration failed:", profile.name, error);
                failures.push(profile.name + ": " + error.message);
            }
        }
        renderProfiles();
        alert("ImageKit migration finished. " + moved + " of " + candidates.length + " photo(s) moved successfully. Original Supabase files were kept." +
            (failures.length ? "\n\nNot moved:\n" + failures.join("\n") : ""));
    } finally {
        if (button) { button.disabled = false; button.textContent = "Move old photos to ImageKit"; }
    }
}

export async function initializeTranslatorManagement() {
    $("addTranslatorProfile")?.addEventListener("click", () => openModal());
    $("refreshTranslatorProfiles")?.addEventListener("click", () => loadProfiles().catch(error => console.error(error)));
    $("migrateTranslatorImages")?.addEventListener("click", migrateLegacyImages);
    $("translatorProfileSearch")?.addEventListener("input", renderProfiles);
    $("translatorProfileGrid")?.addEventListener("click", handleProfileAction);
    await loadProfiles();
}
