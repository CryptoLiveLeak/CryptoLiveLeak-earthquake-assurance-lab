# WordPress Frontend Deployment

## What you need

- An existing HTTPS WordPress site with permission to upload custom plugins (WordPress 6.5+, PHP 8.0+).
- Required: `cll-earthquake-lab-<version>.zip`, the custom dashboard plugin.
- Optional: `cll-assurance-lab-<version>.zip`, the dedicated full-width theme for a NEW lab site or subdomain.
- No Elementor, Divi, paid theme, API-key plugin, Node.js hosting, cloud server, or public NATS broker is required for this frontend.
- Use your existing theme on an established website. Changing themes affects the whole site; the optional theme intentionally makes the lab the homepage.

## Install on your existing WordPress site

1. Back up the site and database using your host's backup facility. Prefer staging for the first installation.
2. Open Plugins > Add New Plugin > Upload Plugin. Select the plugin ZIP, install it, then activate it.
3. Create a page named Earthquake Assurance Lab. Add the built-in Shortcode block containing `[cll_earthquake_lab]`.
4. Choose your theme's full-width page layout, if available. Preview first, then publish the page when ready.
5. Open the page while logged out. Check the synthetic event list, all four fault scenarios, and both downloadable evidence reports. Test a narrow/mobile window too.
6. Select Public feed. Confirm it either loads catalog events or explicitly says that it has fallen back to synthetic replay. This is not a live early-warning feed.

Settings > Earthquake Lab provides a direct bundled-dashboard preview and usage notes. No settings or secrets need to be entered.

## Optional dedicated theme

On a new, dedicated lab site only: install and activate the plugin first, then Appearance > Themes > Add New > Upload Theme, upload the theme ZIP and activate it. The homepage renders the lab automatically. Do not activate this theme on your established corporate site unless you intend to change its appearance and homepage.

## Operational boundary

The frontend runs a JavaScript demonstration policy and revision gate in the visitor's browser. The C++ decision engine and NATS services run separately on the developer's computer or a CI runner. Installing the WordPress plugin does NOT install those backend services. Recorded C++ and NATS evidence has independent timestamps; it is not a live health monitor.

Synthetic data is the default, with no automatic external feed request. Public feed mode requests earthquake catalog data directly from earthquake.usgs.gov in the browser. Demo quality scores and thresholds are illustrative, not USGS uncertainty estimates. No public warning output, site telemetry, or user account is provided by this plugin.

The iframe uses the site's own bundled files, not a private Sites URL. Its styling is isolated from the host theme. Strict host CSP rules must permit same-origin frames and module scripts and the USGS feed connection if that optional mode is used. Do not disable security globally to make it work; scope adjustments to this page and asset path.

## Updates and rollback

Generate fresh tests/evidence, then build a new plugin ZIP. Upload it and choose WordPress's replace-current-version option. Keep the previous ZIP and host backup for rollback. Clear the page/CDN cache after replacement. No remote code updater or server-side command execution endpoint is included.

Deactivating the plugin stops shortcode rendering and leaves page content intact. It creates no database tables or stored credentials. Deleting the plugin removes the bundled dashboard files through WordPress. Your previous theme can be reactivated independently.

## Scope

The WordPress packages deliver the reviewer dashboard only. Do not represent this lab as an agency system, production public-safety experience, certification, or agency approval.

## Incremental costs

These custom plugin/theme packages have no license fee. Using an existing host and subdomain can avoid additional hosting/domain spend, subject to your host's limits. A new domain or paid hosting is optional, not required. Full-stack demonstrations run locally/on demand; no always-on cloud subscription is included or needed.

## Verification and remaining checks

Locally verified on WordPress 7.1.2 and PHP 8.5.9 using an isolated SQLite test installation: plugin activation, shortcode rendering, script/style loading, anonymous admin-access boundary, dashboard/module/evidence HTTP responses, optional theme homepage, safe deactivation, and absence of fatal PHP errors. SQLite is a test fixture, not a required production plugin.

Coverage, integration, and transport figures shown on the dashboard come from the evidence files bundled at packaging time; each file records its own run date and commit. They cover this demonstration only, not any agency system.

The live deployment at assurance-lab.cryptoliveleak.com was installed and checked on a Kinsta-hosted WordPress site in October 2026.

## Developer rebuild

`npm run package:wordpress` copies `public/` into the plugin's `assets/lab/` folder (Markdown excluded), stamps the version, and writes `dist/*.zip` with a `SHA256SUMS.txt` manifest. CI builds the same packages as an artifact on every commit; install the artifact from a passing run so the bundled evidence matches a public commit.

Official references: [WordPress shortcodes](https://developer.wordpress.org/plugins/shortcodes/) and [theme structure](https://developer.wordpress.org/themes/core-concepts/theme-structure/).
