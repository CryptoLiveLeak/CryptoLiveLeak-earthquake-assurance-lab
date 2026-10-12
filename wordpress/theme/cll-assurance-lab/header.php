<?php if (!defined('ABSPATH')) { exit; } ?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head><meta charset="<?php bloginfo('charset'); ?>"><meta name="viewport" content="width=device-width, initial-scale=1"><?php wp_head(); ?></head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link" href="#content">Skip to content</a>
<?php if (has_nav_menu('primary')) { wp_nav_menu(array('theme_location' => 'primary', 'container' => 'nav', 'container_class' => 'cll-theme-nav')); } ?>
