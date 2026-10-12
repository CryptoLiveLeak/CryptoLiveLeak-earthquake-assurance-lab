<?php
if (!defined('ABSPATH')) { exit; }
get_header();
?>
<main id="content">
<h1 class="screen-reader-text">Earthquake Assurance Lab &mdash; CryptoLiveLeak, Inc.</h1>
<noscript><div class="cll-page"><p>Independent reference implementation using public and synthetic data. Not affiliated with or endorsed by USGS. Not deployed for public warning or life-safety decisions. JavaScript is required for the interactive dashboard.</p></div></noscript>
<?php if (shortcode_exists('cll_earthquake_lab')) { echo do_shortcode('[cll_earthquake_lab]'); }
else { echo '<div class="cll-page"><h1>Earthquake Assurance Lab</h1><p>The lab is not available yet.</p></div>'; } ?>
</main>
<?php get_footer(); ?>
