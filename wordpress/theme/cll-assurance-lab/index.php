<?php
if (!defined('ABSPATH')) { exit; }
get_header();
?>
<main id="content" class="cll-page">
<?php if (have_posts()) { while (have_posts()) { the_post(); ?>
<article><h1><?php the_title(); ?></h1><?php the_content(); ?></article>
<?php } the_posts_navigation(); } else { echo '<h1>Page not found</h1>'; } ?>
</main>
<?php get_footer(); ?>
