import { supabase } from "../../js/config.js";

const $ = (id) => document.getElementById(id);
const text = (id, value) => { const node = $(id); if (node) node.textContent = value ?? ""; };
const escapeText = (value) => String(value ?? "");

export function initializePlatformAdmin({ getMovies, getSeries, adminUser }) {
    let categories = [];
    let categoryModal = null;
    let settings = {};
    let analyticsBusy = false;

    const movies = () => getMovies() || [];
    const series = () => getSeries() || [];

    function normalized(value) {
        return String(value || "").trim().toLocaleLowerCase();
    }

    function categoryCounts(name) {
        const key = normalized(name);
        return {
            movies: movies().filter(item => normalized(item.category) === key).length,
            series: series().filter(item => normalized(item.category) === key).length
        };
    }

    function ensureCategoryAddButton() {
        const heading = document.querySelector(".category-management-heading");
        if (!heading || $("addCategoryBtn")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.id = "addCategoryBtn";
        button.className = "primary-btn category-add-button";
        button.textContent = "+ Add Category";
        button.addEventListener("click", () => openCategoryModal());
        heading.appendChild(button);
    }

    function renderCategories() {
        const grid = $("categoryGrid");
        if (!grid) return;
        ensureCategoryAddButton();

        const search = ($("categorySearch")?.value || "").trim().toLocaleLowerCase();
        const visible = categories
            .filter(item => item.name.toLocaleLowerCase().includes(search))
            .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.name.localeCompare(b.name));

        text("categoryResultsCount", visible.length);
        grid.replaceChildren();

        if (!visible.length) {
            const empty = document.createElement("div");
            empty.className = "category-empty";
            empty.textContent = search ? "No categories match your search." : "No categories yet. Add one to use it when creating movies or series.";
            grid.appendChild(empty);
            return;
        }

        visible.forEach((category, index) => {
            const count = categoryCounts(category.name);
            const total = count.movies + count.series;
            const card = document.createElement("article");
            card.className = "category-admin-card";

            const top = document.createElement("div");
            top.className = "category-card-top";
            const icon = document.createElement("div");
            icon.className = "category-card-icon";
            icon.textContent = ["✦", "▣", "◈", "▶", "✧"][index % 5];
            const number = document.createElement("span");
            number.className = "category-card-index";
            number.textContent = String(index + 1).padStart(2, "0");
            top.append(icon, number);

            const title = document.createElement("h3");
            title.textContent = category.name;
            const description = document.createElement("p");
            description.textContent = category.description || (total + (total === 1 ? " title assigned" : " titles assigned"));

            const counts = document.createElement("div");
            counts.className = "category-card-counts";
            const movieCount = document.createElement("span");
            movieCount.innerHTML = '<i class="category-count-dot movie"></i>';
            movieCount.append(document.createTextNode(count.movies + " Movies"));
            const seriesCount = document.createElement("span");
            seriesCount.innerHTML = '<i class="category-count-dot series"></i>';
            seriesCount.append(document.createTextNode(count.series + " Series"));
            counts.append(movieCount, seriesCount);

            const footer = document.createElement("div");
            footer.className = "category-card-footer";
            const totalLabel = document.createElement("strong");
            totalLabel.textContent = total + " assigned";
            const actions = document.createElement("div");
            actions.className = "category-card-actions";

            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "category-action-btn";
            edit.textContent = "Edit";
            edit.dataset.categoryAction = "edit";
            edit.dataset.id = category.id;

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "category-action-btn danger";
            remove.textContent = "Delete";
            remove.dataset.categoryAction = "delete";
            remove.dataset.id = category.id;
            remove.disabled = total > 0;
            remove.title = total > 0 ? "Move all titles out of this category before deleting it." : "Delete empty category";

            actions.append(edit, remove);
            footer.append(totalLabel, actions);
            card.append(top, title, description, counts, footer);
            grid.appendChild(card);
        });
    }

    async function refreshCategories() {
        const grid = $("categoryGrid");
        if (grid && !categories.length) {
            const loading = document.createElement("div");
            loading.className = "category-loading";
            loading.textContent = "Loading categories from Supabase...";
            grid.replaceChildren(loading);
        }

        const { data, error } = await supabase
            .from("categories")
            .select("id,name,description,sort_order,is_active")
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true });

        if (error) {
            console.error("CINEVA category load failed:", error);
            if (grid) {
                grid.replaceChildren();
                const message = document.createElement("div");
                message.className = "category-empty";
                message.textContent = "Unable to load categories. Check administrator access and try again.";
                grid.appendChild(message);
            }
            throw error;
        }

        categories = data || [];
        renderCategories();
        return categories;
    }

    function openCategoryModal(category = null) {
        if (!categoryModal) {
            categoryModal = document.createElement("div");
            categoryModal.className = "platform-modal-backdrop";
            categoryModal.innerHTML =
                '<section class="platform-modal-card" role="dialog" aria-modal="true" aria-labelledby="categoryModalTitle">' +
                    '<div class="platform-modal-heading"><div><span class="admin-eyebrow">CONTENT ORGANIZATION</span><h2 id="categoryModalTitle">Add Category</h2><p>Categories can be assigned to movies and series.</p></div>' +
                    '<button type="button" class="platform-modal-close" data-close-category aria-label="Close">×</button></div>' +
                    '<form id="platformCategoryForm">' +
                        '<label class="platform-field">Category name<input id="platformCategoryName" name="name" maxlength="60" required placeholder="e.g. Documentary"></label>' +
                        '<label class="platform-field">Description <span>(optional)</span><textarea id="platformCategoryDescription" name="description" maxlength="180" rows="3" placeholder="A short description for administrators"></textarea></label>' +
                        '<p id="platformCategoryMessage" class="platform-form-message" aria-live="polite"></p>' +
                        '<div class="platform-modal-actions"><button type="button" class="platform-secondary-btn" data-close-category>Cancel</button><button type="submit" class="primary-btn" id="savePlatformCategory">Save Category</button></div>' +
                    '</form>' +
                '</section>';
            document.body.appendChild(categoryModal);
            categoryModal.addEventListener("click", event => {
                if (event.target === categoryModal || event.target.closest("[data-close-category]")) closeCategoryModal();
            });
            categoryModal.querySelector("#platformCategoryForm").addEventListener("submit", saveCategory);
        }

        categoryModal.dataset.editId = category?.id || "";
        categoryModal.querySelector("#categoryModalTitle").textContent = category ? "Edit Category" : "Add Category";
        categoryModal.querySelector("#platformCategoryName").value = category?.name || "";
        categoryModal.querySelector("#platformCategoryDescription").value = category?.description || "";
        categoryModal.querySelector("#savePlatformCategory").textContent = category ? "Save Changes" : "Create Category";
        categoryModal.querySelector("#platformCategoryMessage").textContent = "";
        categoryModal.hidden = false;
        document.body.classList.add("platform-modal-open");
        categoryModal.querySelector("#platformCategoryName").focus();
    }

    function closeCategoryModal() {
        if (!categoryModal) return;
        categoryModal.hidden = true;
        document.body.classList.remove("platform-modal-open");
    }

    async function saveCategory(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const name = $("platformCategoryName").value.trim().replace(/\s+/g, " ");
        const description = $("platformCategoryDescription").value.trim() || null;
        const editId = categoryModal.dataset.editId;
        const message = $("platformCategoryMessage");
        const button = $("savePlatformCategory");

        if (!name) {
            message.textContent = "Enter a category name.";
            return;
        }

        const duplicate = categories.find(item => normalized(item.name) === normalized(name) && item.id !== editId);
        if (duplicate) {
            message.textContent = "A category with this name already exists.";
            return;
        }

        button.disabled = true;
        button.textContent = "Saving...";
        message.textContent = "";

        try {
            if (editId) {
                const oldCategory = categories.find(item => item.id === editId);
                if (!oldCategory) throw new Error("This category could not be found. Refresh and try again.");

                const movieVariants = [...new Set(movies().map(item => item.category).filter(value => normalized(value) === normalized(oldCategory.name)))];
                const seriesVariants = [...new Set(series().map(item => item.category).filter(value => normalized(value) === normalized(oldCategory.name)))];
                const stamp = new Date().toISOString();

                const updates = [];
                if (movieVariants.length) {
                    updates.push(supabase.from("movies").update({ category: name, updated_at: stamp }).in("category", movieVariants));
                }
                if (seriesVariants.length) {
                    updates.push(supabase.from("series").update({ category: name, updated_at: stamp }).in("category", seriesVariants));
                }

                const results = await Promise.all(updates);
                const failed = results.find(result => result.error);
                if (failed) throw failed.error;

                const { error } = await supabase.from("categories").update({
                    name,
                    description,
                    updated_at: stamp
                }).eq("id", editId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from("categories").insert({
                    name,
                    description,
                    sort_order: categories.length + 1,
                    is_active: true
                });
                if (error) throw error;
            }

            closeCategoryModal();
            await refreshCategories();
            window.dispatchEvent(new CustomEvent("cineva:categories-updated"));
            alert(editId ? "Category updated. Matching movie and series records were renamed." : "Category created. You can now assign it to new content.");
        } catch (error) {
            console.error("CINEVA category save failed:", error);
            message.textContent = error.message || "Unable to save this category.";
        } finally {
            button.disabled = false;
            button.textContent = editId ? "Save Changes" : "Create Category";
        }
    }

    async function deleteCategory(id) {
        const category = categories.find(item => item.id === id);
        if (!category) return;
        const count = categoryCounts(category.name);
        if (count.movies + count.series > 0) {
            alert("This category still has content. Reassign or rename those titles before deleting it.");
            return;
        }
        if (!confirm('Delete the empty category "' + category.name + '"?')) return;

        const { error } = await supabase.from("categories").delete().eq("id", id);
        if (error) {
            alert("Unable to delete category: " + error.message);
            return;
        }
        await refreshCategories();
    }

    function initializeCategoryEvents() {
        const grid = $("categoryGrid");
        if (!grid || grid.dataset.platformEvents === "true") return;
        grid.dataset.platformEvents = "true";
        grid.addEventListener("click", event => {
            const button = event.target.closest("[data-category-action]");
            if (!button) return;
            const category = categories.find(item => item.id === button.dataset.id);
            if (!category) return;
            if (button.dataset.categoryAction === "edit") openCategoryModal(category);
            if (button.dataset.categoryAction === "delete") deleteCategory(category.id);
        });
        $("categorySearch")?.addEventListener("input", renderCategories);
    }

    function getCategoryNames() {
        return categories.filter(item => item.is_active !== false).map(item => item.name);
    }

    function injectAnalyticsUI() {
        const page = $("analyticsPage");
        if (!page || $("platformAnalyticsPanel")) return;
        const panel = document.createElement("section");
        panel.id = "platformAnalyticsPanel";
        panel.className = "platform-analytics-panel";
        panel.innerHTML =
            '<div class="platform-analytics-heading"><div><span class="admin-eyebrow">CINEVA PERFORMANCE</span><h2>Platform Overview</h2><p>Content, engagement and audience activity from your Supabase records.</p></div>' +
            '<label class="platform-range-control">Period<select id="platformAnalyticsRange"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></label></div>' +
            '<div class="platform-analytics-kpis" id="platformAnalyticsKpis"><div class="category-loading">Loading platform metrics...</div></div>' +
            '<div class="platform-analytics-lower">' +
                '<section class="platform-analytics-card"><div class="platform-analytics-card-heading"><div><h3>Most viewed content</h3><p>Top movies and series by recorded views</p></div></div><div id="platformTopContent" class="platform-ranking-list"><div class="category-loading">Loading...</div></div></section>' +
                '<section class="platform-analytics-card"><div class="platform-analytics-card-heading"><div><h3>Category distribution</h3><p>Titles assigned to each category</p></div></div><div id="platformTopCategories" class="platform-ranking-list"><div class="category-loading">Loading...</div></div></section>' +
            '</div><p id="platformAnalyticsUpdated" class="visitor-updated">Loading platform data...</p>';
        const visitorHeading = page.querySelector(".analytics-heading");
        if (visitorHeading) visitorHeading.insertAdjacentElement("beforebegin", panel);
        else page.prepend(panel);
        $("platformAnalyticsRange")?.addEventListener("change", loadAnalytics);
    }

    function renderKpi(label, value, detail, icon) {
        const card = document.createElement("article");
        card.className = "platform-kpi-card";
        const top = document.createElement("div");
        top.className = "platform-kpi-top";
        const name = document.createElement("span");
        name.textContent = label;
        const symbol = document.createElement("i");
        symbol.textContent = icon;
        top.append(name, symbol);
        const number = document.createElement("strong");
        number.textContent = Number.isFinite(Number(value)) ? Number(value).toLocaleString() : String(value ?? "—");
        const note = document.createElement("small");
        note.textContent = detail;
        card.append(top, number, note);
        return card;
    }

    function renderRanking(containerId, rows, valueKey, suffix) {
        const container = $(containerId);
        if (!container) return;
        container.replaceChildren();
        if (!rows.length) {
            const empty = document.createElement("div");
            empty.className = "category-empty";
            empty.textContent = "No data available yet.";
            container.appendChild(empty);
            return;
        }
        const maximum = Math.max(1, ...rows.map(row => Number(row[valueKey] || 0)));
        rows.forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "platform-ranking-row";
            const name = document.createElement("div");
            name.className = "platform-ranking-name";
            const title = document.createElement("strong");
            title.textContent = item.title;
            const meta = document.createElement("small");
            meta.textContent = item.meta || "";
            name.append(title, meta);
            const track = document.createElement("div");
            track.className = "platform-ranking-track";
            const fill = document.createElement("span");
            fill.style.width = Math.max(0, Number(item[valueKey] || 0) / maximum * 100) + "%";
            track.appendChild(fill);
            const amount = document.createElement("b");
            amount.textContent = Number(item[valueKey] || 0).toLocaleString() + (suffix || "");
            row.append(name, track, amount);
            container.appendChild(row);
        });
    }

    function dateKey(date) {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Kigali",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(date);
        const values = {};
        parts.forEach(part => { if (part.type !== "literal") values[part.type] = part.value; });
        return values.year + "-" + values.month + "-" + values.day;
    }

    async function loadAnalytics() {
        if (analyticsBusy) return;
        analyticsBusy = true;
        const kpis = $("platformAnalyticsKpis");
        if (kpis) {
            kpis.replaceChildren();
            const loading = document.createElement("div");
            loading.className = "category-loading";
            loading.textContent = "Updating platform metrics...";
            kpis.appendChild(loading);
        }

        try {
            const days = Number($("platformAnalyticsRange")?.value || 30);
            const today = new Date();
            const start = new Date(today);
            start.setDate(start.getDate() - days + 1);
            const startKey = dateKey(start);
            const endKey = dateKey(today);

            const [profileResult, episodeResult] = await Promise.all([
                supabase.from("profiles").select("id", { count: "exact", head: true }),
                supabase.from("episodes").select("id", { count: "exact", head: true })
            ]);

            const visitRows = [];
            let offset = 0;
            const pageSize = 1000;
            while (true) {
                const { data, error } = await supabase
                    .from("site_visits")
                    .select("visitor_id,visit_day,path")
                    .gte("visit_day", startKey)
                    .lte("visit_day", endKey)
                    .order("visit_day", { ascending: true })
                    .range(offset, offset + pageSize - 1);
                if (error) throw error;
                visitRows.push(...(data || []));
                if (!data || data.length < pageSize) break;
                offset += pageSize;
            }

            const movieRows = movies();
            const seriesRows = series();
            const allContent = [
                ...movieRows.map(item => ({ ...item, contentType: "Movie" })),
                ...seriesRows.map(item => ({ ...item, contentType: "Series" }))
            ];
            const totalViews = allContent.reduce((sum, item) => sum + Math.max(0, Number(item.views || 0)), 0);
            const totalLikes = allContent.reduce((sum, item) => sum + Math.max(0, Number(item.likes || 0)), 0);
            const activeCount = allContent.filter(item => item.is_active !== false).length;
            const uniqueVisitors = new Set(visitRows.map(item => item.visitor_id).filter(Boolean)).size;

            if (kpis) {
                kpis.replaceChildren();
                kpis.append(
                    renderKpi("Catalog titles", allContent.length, activeCount + " currently active", "▣"),
                    renderKpi("Episodes", episodeResult.error ? "—" : episodeResult.count || 0, "Across all series", "▶"),
                    renderKpi("Total views", totalViews, "Recorded on movies and series", "◉"),
                    renderKpi("Likes", totalLikes, "Recorded content likes", "♡"),
                    renderKpi("User accounts", profileResult.error ? "—" : profileResult.count || 0, "Registered profiles", "♙"),
                    renderKpi("Unique visitors", uniqueVisitors, "Last " + days + " days", "◷")
                );
            }

            const topContent = allContent
                .slice()
                .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
                .slice(0, 6)
                .map(item => ({
                    title: item.title || "Untitled",
                    meta: item.contentType + " • " + (item.category || "Uncategorized"),
                    views: Number(item.views || 0)
                }));
            renderRanking("platformTopContent", topContent, "views", "");

            const grouped = new Map();
            allContent.forEach(item => {
                const name = String(item.category || "").trim() || "Uncategorized";
                const key = normalized(name);
                const existing = grouped.get(key) || { title: name, count: 0 };
                existing.count += 1;
                grouped.set(key, existing);
            });
            const topCategories = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 6);
            renderRanking("platformTopCategories", topCategories, "count", " titles");

            const stamp = $("platformAnalyticsUpdated");
            if (stamp) stamp.textContent = "Updated " + new Intl.DateTimeFormat("en", { timeZone: "Africa/Kigali", hour: "2-digit", minute: "2-digit" }).format(new Date()) + " • Kigali time";
        } catch (error) {
            console.error("CINEVA platform analytics failed:", error);
            if (kpis) {
                kpis.replaceChildren();
                const message = document.createElement("div");
                message.className = "category-empty";
                message.textContent = "Platform analytics could not be loaded. Verify administrator permissions and analytics tables.";
                kpis.appendChild(message);
            }
        } finally {
            analyticsBusy = false;
        }
    }

    async function loadSettings() {
        const { data, error } = await supabase
            .from("platform_settings")
            .select("setting_key,setting_value")
            .in("setting_key", ["site_name", "site_tagline", "support_whatsapp"]);

        if (error) throw error;
        settings = {};
        (data || []).forEach(row => { settings[row.setting_key] = row.setting_value; });
        $("platformSiteName").value = settings.site_name || "CINEVA";
        $("platformSiteTagline").value = settings.site_tagline || "";
        $("platformSupportWhatsApp").value = settings.support_whatsapp || "";
    }

    function injectSettingsUI() {
        const page = $("settingsPage");
        if (!page || $("platformSettingsLayout")) return;
        const layout = document.createElement("div");
        layout.id = "platformSettingsLayout";
        layout.className = "platform-settings-layout";
        layout.innerHTML =
            '<div class="management-heading"><div><span class="admin-eyebrow">PLATFORM CONTROL</span><h2>Admin Settings</h2><p>Manage public CINEVA identity and secure your administrator account.</p></div></div>' +
            '<div class="platform-settings-grid">' +
                '<section class="platform-settings-card"><div class="platform-settings-card-heading"><span class="platform-settings-icon">✦</span><div><h3>Platform Identity</h3><p>These values are displayed across the public website.</p></div></div>' +
                    '<form id="platformIdentityForm"><label class="platform-field">Website name<input id="platformSiteName" maxlength="40" required></label>' +
                    '<label class="platform-field">Website tagline<input id="platformSiteTagline" maxlength="100" required></label>' +
                    '<label class="platform-field">Support WhatsApp<input id="platformSupportWhatsApp" inputmode="tel" maxlength="20" placeholder="+250..." required></label>' +
                    '<p id="platformIdentityMessage" class="platform-form-message" aria-live="polite"></p><button class="primary-btn" type="submit" id="savePlatformIdentity">Save Platform Settings</button></form></section>' +
                '<section class="platform-settings-card"><div class="platform-settings-card-heading"><span class="platform-settings-icon">⌑</span><div><h3>Administrator Security</h3><p>Change the password for the currently signed-in administrator.</p></div></div>' +
                    '<div class="platform-admin-identity"><span>Signed in as</span><strong id="platformAdminEmail"></strong><small>Admin access is checked against the CINEVA admins table.</small></div>' +
                    '<form id="platformPasswordForm"><label class="platform-field">New password<input id="platformNewPassword" type="password" minlength="10" autocomplete="new-password" required placeholder="At least 10 characters"></label>' +
                    '<label class="platform-field">Confirm new password<input id="platformConfirmPassword" type="password" minlength="10" autocomplete="new-password" required placeholder="Repeat new password"></label>' +
                    '<p id="platformPasswordMessage" class="platform-form-message" aria-live="polite"></p><button class="primary-btn" type="submit" id="savePlatformPassword">Update Admin Password</button></form></section>' +
            '</div>' +
            '<div class="platform-security-note"><strong>Protected dashboard</strong><p>Administrator authorization and sign-out-on-refresh remain enabled. A fresh login is required after every dashboard refresh.</p></div>';
        page.replaceChildren(layout);

        $("platformAdminEmail").textContent = adminUser?.email || "Administrator";
        $("platformIdentityForm").addEventListener("submit", savePlatformIdentity);
        $("platformPasswordForm").addEventListener("submit", saveAdminPassword);
    }

    async function savePlatformIdentity(event) {
        event.preventDefault();
        const button = $("savePlatformIdentity");
        const message = $("platformIdentityMessage");
        const siteName = $("platformSiteName").value.trim();
        const tagline = $("platformSiteTagline").value.trim();
        const whatsapp = $("platformSupportWhatsApp").value.trim();
        const digits = whatsapp.replace(/\D/g, "");

        if (digits.length < 8 || digits.length > 15) {
            message.textContent = "Enter a valid WhatsApp number with country code.";
            return;
        }

        button.disabled = true;
        button.textContent = "Saving...";
        message.textContent = "";
        const stamp = new Date().toISOString();
        const rows = [
            { setting_key: "site_name", setting_value: siteName, is_public: true, updated_at: stamp, updated_by: adminUser.id },
            { setting_key: "site_tagline", setting_value: tagline, is_public: true, updated_at: stamp, updated_by: adminUser.id },
            { setting_key: "support_whatsapp", setting_value: whatsapp, is_public: true, updated_at: stamp, updated_by: adminUser.id }
        ];

        try {
            const { error } = await supabase.from("platform_settings").upsert(rows, { onConflict: "setting_key" });
            if (error) throw error;
            settings = { site_name: siteName, site_tagline: tagline, support_whatsapp: whatsapp };
            message.textContent = "Settings saved. Public pages will use the updated identity on their next load.";
            window.dispatchEvent(new CustomEvent("cineva:platform-settings-updated", { detail: settings }));
        } catch (error) {
            console.error("CINEVA settings save failed:", error);
            message.textContent = error.message || "Unable to save platform settings.";
        } finally {
            button.disabled = false;
            button.textContent = "Save Platform Settings";
        }
    }

    async function saveAdminPassword(event) {
        event.preventDefault();
        const password = $("platformNewPassword").value;
        const confirmPassword = $("platformConfirmPassword").value;
        const message = $("platformPasswordMessage");
        const button = $("savePlatformPassword");

        if (password.length < 10) {
            message.textContent = "Use at least 10 characters for your new password.";
            return;
        }
        if (password !== confirmPassword) {
            message.textContent = "The passwords do not match.";
            return;
        }

        button.disabled = true;
        button.textContent = "Updating...";
        message.textContent = "";
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            $("platformPasswordForm").reset();
            message.textContent = "Administrator password updated successfully.";
        } catch (error) {
            console.error("CINEVA admin password update failed:", error);
            message.textContent = error.message || "Unable to update password. Sign in again and retry.";
        } finally {
            button.disabled = false;
            button.textContent = "Update Admin Password";
        }
    }

    async function initialize() {
        injectAnalyticsUI();
        injectSettingsUI();
        initializeCategoryEvents();
        await Promise.all([refreshCategories(), loadSettings()]);
    }

    return {
        initialize,
        refreshCategories,
        renderCategories,
        getCategoryNames,
        loadAnalytics
    };
}
