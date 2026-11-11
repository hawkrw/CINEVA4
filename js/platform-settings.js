import { publicSupabase as supabase } from "./config.js";

(async function applyCinevaPlatformSettings() {
    try {
        const { data, error } = await supabase
            .from("platform_settings")
            .select("setting_key,setting_value")
            .eq("is_public", true);

        if (error) throw error;

        const settings = {};
        (data || []).forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });

        window.CINEVA_PLATFORM_SETTINGS = settings;

        const siteName = String(settings.site_name || "CINEVA").trim();
        const tagline = String(settings.site_tagline || "").trim();
        const whatsappDigits = String(settings.support_whatsapp || "").replace(/\D/g, "");

        if (siteName) {
            document.title = document.title.replace(/CINEVA/gi, () => siteName);
            document.querySelectorAll(".logo-text h2").forEach(node => {
                const accentStart = Math.max(0, siteName.length - 2);
                node.replaceChildren(document.createTextNode(siteName.slice(0, accentStart)));
                const accent = document.createElement("span");
                accent.textContent = siteName.slice(accentStart);
                node.appendChild(accent);
            });
            document.querySelectorAll(".logo-text small").forEach(node => {
                if (tagline) node.textContent = tagline;
            });
            document.querySelectorAll('meta[name="apple-mobile-web-app-title"]').forEach(node => {
                node.setAttribute("content", siteName);
            });
        }

        if (tagline) {
            document.querySelectorAll('meta[name="application-name"]').forEach(node => {
                node.setAttribute("content", tagline);
            });
        }

        if (whatsappDigits.length >= 8 && whatsappDigits.length <= 15) {
            document.querySelectorAll('a[href*="wa.me/"], a[href*="api.whatsapp.com/send"]').forEach(link => {
                link.href = "https://wa.me/" + whatsappDigits;
            });
        }
    } catch (error) {
        // Public pages continue to work with their built-in CINEVA defaults.
        console.warn("CINEVA: Public platform settings are not available yet.", error);
    }
})();
