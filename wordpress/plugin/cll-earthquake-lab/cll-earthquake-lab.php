<?php
/**
 * Plugin Name: CryptoLiveLeak Earthquake Assurance Lab
 * Description: Self-hosted reference dashboard. Shortcode: [cll_earthquake_lab]. Simulation only; no public warnings.
 * Version: 0.3.0
 * Requires at least: 6.5
 * Requires PHP: 8.0
 * Author: CryptoLiveLeak, Inc.
 * License: GPL-2.0-or-later
 * Text Domain: cll-earthquake-lab
 */

if (!defined('ABSPATH')) { exit; }

function cll_earthquake_lab_shortcode() {
    $url = plugins_url('assets/lab/index.html', __FILE__);
    wp_enqueue_script('cll-earthquake-lab-embed', plugins_url('embed.js', __FILE__), array(), '0.3.0', true);
    wp_enqueue_style('cll-earthquake-lab-embed', plugins_url('embed.css', __FILE__), array(), '0.3.0');
    return '<div class="cll-earthquake-lab-embed"><iframe class="cll-earthquake-lab-frame" src="' . esc_url($url) . '" title="Earthquake Assurance Lab - simulation only" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>' .
        '<p class="cll-lab-direct"><a href="' . esc_url($url) . '" target="_blank" rel="noopener">Open the lab in its own window</a></p></div>';
}
add_shortcode('cll_earthquake_lab', 'cll_earthquake_lab_shortcode');

// Enqueue early for normal content; the shortcode also supports theme-driven rendering.
add_action('wp_enqueue_scripts', function () {
    $post = get_post();
    if (($post && has_shortcode($post->post_content, 'cll_earthquake_lab')) || get_template() === 'cll-assurance-lab') {
        wp_enqueue_script('cll-earthquake-lab-embed', plugins_url('embed.js', __FILE__), array(), '0.3.0', true);
        wp_enqueue_style('cll-earthquake-lab-embed', plugins_url('embed.css', __FILE__), array(), '0.3.0');
    }
});

add_action('admin_menu', function () {
    add_options_page('Earthquake Assurance Lab', 'Earthquake Lab', 'manage_options', 'cll-earthquake-lab', 'cll_earthquake_lab_settings');
});

function cll_earthquake_lab_settings() {
    if (!current_user_can('manage_options')) { return; }
    echo '<div class="wrap"><h1>Earthquake Assurance Lab</h1><p>Add a Shortcode block to any page and enter <code>[cll_earthquake_lab]</code>.</p>';
    echo '<p>No API keys, paid plugins, Node.js service, or NATS service are needed on your WordPress host. The dashboard and recorded reports are bundled locally.</p>';
    echo '<p>Synthetic mode is the default. Selecting Public feed requests public earthquake catalog data from earthquake.usgs.gov directly in the visitor browser. No visitor account or analytics is added by this plugin.</p>';
    echo '<p>This is a reference demonstration, not an earthquake-warning service or proof of government approval. New evidence is deployed by installing an updated plugin ZIP.</p>';
    echo '<p><a href="' . esc_url(plugins_url('assets/lab/index.html', __FILE__)) . '" target="_blank" rel="noopener">Preview bundled lab</a></p></div>';
}
