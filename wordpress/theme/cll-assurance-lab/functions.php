<?php
if (!defined('ABSPATH')) { exit; }
add_action('after_setup_theme', function () {
    add_theme_support('title-tag');
    add_theme_support('html5', array('search-form', 'gallery', 'caption', 'style', 'script'));
    add_theme_support('responsive-embeds');
    register_nav_menu('primary', 'Primary navigation');
});
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style('cll-assurance-theme', get_stylesheet_uri(), array(), '0.3.0');
});

// The lab must never present itself under an agency program name. Force a neutral
// document title and description regardless of the Site Title setting.
add_filter('pre_get_document_title', function () {
    return is_front_page() ? 'Earthquake Assurance Lab | CryptoLiveLeak, Inc.' : '';
});
add_action('wp_head', function () {
    if (is_front_page()) {
        echo '<meta name="description" content="' . esc_attr('Independent software-assurance reference implementation by CryptoLiveLeak, Inc. using public and synthetic earthquake data. Not affiliated with or endorsed by USGS.') . '">' . "\n";
    }
}, 1);
