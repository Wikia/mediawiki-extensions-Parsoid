/* A map of test titles and their manually verified output. If the parser
 * output matches the expected output listed here, the test can be marked as
 * passing in parserTests.js. */

// CSA note: This whitelist dates back to when parsoid was an experiment,
// and there wasn't "php"/"parsoid" support in upstream's parserTests.  Now
// that Parsoid is mainstream, I'm trying to deprecate this file and move
// the tweaked tests upstream to mediawiki/core (splitting tests into 'php'
// and 'parsoid' versions where necessary).  This helps document the
// differences between the PHP and Parsoid parsers in one place (albeit
// one gigantic hard-to-read file, but still).
// So please don't add new entries here, except for experimental stuff
// (selser?) which we're not sure we want to document/upstream.
// Known-broken-but-we'll-fix-it stuff goes in parserTests-blacklist.js

var testWhiteList = {};

// Valid, but the PHP parser strips the empty tags out for giggles.
testWhiteList["Italics and bold: 2-quote opening sequence: (2,5)"] = "<p><i>foo</i><b></b></p>";
testWhiteList["Italics and bold: 3-quote opening sequence: (3,5)"] = "<p><b>foo<i></i></b></p>";
testWhiteList["Italics and bold: 4-quote opening sequence: (4,5)"] = "<p>'<b>foo<i></i></b></p>";
testWhiteList["Italics and bold: multiple quote sequences: (3,4,2)"] = "<p><b>foo'</b>bar<i></i></p>";
testWhiteList["Italics and bold: multiple quote sequences: (3,4,3)"] = "<p><b>foo'</b>bar<b></b></p>";
// We insert an empty bold tag pair at the end of the line, that the PHP
// parser strips. The wikitext contains just the first half of the bold
// quote pair.
testWhiteList["Unclosed and unmatched quotes"] = "<p><i><b>Bold italic text </b>with bold deactivated<b> in between.</b></i></p>\n\n<p><b><i>Bold italic text </i>with italic deactivated<i> in between.</i></b></p>\n\n<p><b>Bold text..</b></p>\n\n<p>..spanning two paragraphs (should not work).<b></b></p>\n\n<p><b>Bold tag left open</b></p>\n\n<p><i>Italic tag left open</i></p>\n\n<p>Normal text.\n\n<!-- Unmatching number of opening, closing tags: --></p><p>\n<b>This year'</b>s election <i>should</i> beat <b>last year'</b>s.</p>\n\n<p><i>Tom<b>s car is bigger than </b></i><b>Susan</b>s.</p>\n\n<p>Plain <i>italic'</i>s plain</p>";

// Valid, but the PHP parser reverses the order.
testWhiteList["Italics and bold: 5-quote opening sequence: (5,2)"] = "<p><i><b>foo</b></i></p>";

// The PHP parser screwed up.
// It only checks for convert-to-bold-on-single-character-word when the word
// matches with a bold tag ("'''") that is *odd* in the list of quote tokens.
// This means that the bold token in position 2 (0-indexed) gets converted by
// parsoid, but doesn't get changed by the PHP parser.
// XXX TODO BBQ fix either Parsoid or the PHP parser to not be stupid
testWhiteList["Italics and bold: other quote tests: (3,2,3,3)"] = "<p><b>this is about <i>foo'</i>s family</b></p>";

// This test fails for two reasons:
//  * The test is wrong, there are two colons where there should be :;
//  * The PHP parser is wrong to close the <dl> after the <dt> containing the <ul>.
testWhiteList["Definition Lists: Mixed Lists: Test 1"] = "<dl><dd><dl><dt><ul><li> foo\n</li></ul></dt><dd data-parsoid=\"{&quot;tsr&quot;:[8,11]}\"><ul><li> bar\n</li></ul></dd><dt data-parsoid=\"{&quot;tsr&quot;:[16,18]}\"> baz</dt></dl></dd></dl>";

// These tests fail because the PHP parser has seemingly-random rules regarding dd/dt.
// We are egotistical and assume we got it right, because we are more consistent.
// Also, the nesting is repeated in funny ways, and we recognize the shared nesting and
// keep the still-open tags around until the nesting is complete. PHP doesn't.
testWhiteList["Definition Lists: Mixed Lists: Test 11"] = "<ul><li><ol><li><ul><li><ol><li><dl><dt><ul><li><dl><dt><dl><dt>foo<span typeof=\"mw:Placeholder\" data-parsoid=\"{&quot;src&quot;:&quot; &quot;}\">&nbsp;</span></dt><dd data-parsoid=\"{&quot;tsr&quot;:[13,14],&quot;stx&quot;:&quot;row&quot;}\">bar\n</dd></dl></dt></dl></li></ul></dt><dt data-parsoid=\"{&quot;tsr&quot;:[17,21]}\">boo<span typeof=\"mw:Placeholder\" data-parsoid=\"{&quot;src&quot;:&quot; &quot;}\">&nbsp;</span></dt><dd data-parsoid=\"{&quot;tsr&quot;:[27,28],&quot;stx&quot;:&quot;row&quot;}\">baz</dd></dl></li></ol></li></ul></li></ol></li></ul>";
testWhiteList["Definition Lists: Weird Ones: Test 1"] = "<ul><li><ol><li><dl><dt><ul><li><dl><dd><dl><dd><dl><dt><dl><dt> foo<span typeof=\"mw:Placeholder\" data-parsoid=\"{&quot;src&quot;:&quot; &quot;}\">&nbsp;</span></dt><dd data-parsoid=\"{&quot;tsr&quot;:[14,15],&quot;stx&quot;:&quot;row&quot;}\"> bar (who uses this?)</dd></dl></dt></dl></dd></dl></dd></dl></li></ul></dt></dl></li></ol></li></ul>";

// Italic/link nesting is changed in this test, but the rendered result is the
// same. Currently the result is actually an improvement over the MediaWiki
// output.
testWhiteList["Bug 2702: Mismatched <i>, <b> and <a> tags are invalid"] = "<p><i><a href=\"http://example.com\">text</a></i><a href=\"http://example.com\"><b>text</b></a><i>Something <a href=\"http://example.com\">in italic</a></i><i>Something <a href=\"http://example.com\">mixed</a></i><a href=\"http://example.com\"><b>, even bold</b></a><i><b>Now <a href=\"http://example.com\">both</a></b></i></p>";

// This is a rare edge case, and the new behavior is arguably more consistent
testWhiteList["5 quotes, code coverage +1 line"] = "<p><i><b></b></i></p>";

// empty table tags / with only a caption are legal in HTML5.
testWhiteList["A table with no data."] = "<table></table>";
testWhiteList["A table with nothing but a caption"] = "<table><caption> caption</caption></table>";

// We preserve the trailing whitespace in a table cell, while the PHP parser
// strips it. It renders the same, and round-trips with the space.
//testWhiteList["Table rowspan"] = "<table border=\"1\" data-parsoid=\"{&quot;tsr&quot;:[0,11],&quot;bsp&quot;:[0,121]}\">\n<tbody><tr><td data-parsoid=\"{&quot;tsr&quot;:[12,13]}\"> Cell 1, row 1 \n</td><td rowspan=\"2\" data-parsoid=\"{&quot;tsr&quot;:[29,40]}\"> Cell 2, row 1 (and 2) \n</td><td data-parsoid=\"{&quot;tsr&quot;:[64,65]}\"> Cell 3, row 1 \n</td></tr><tr data-parsoid=\"{&quot;tsr&quot;:[81,84]}\">\n<td data-parsoid=\"{&quot;tsr&quot;:[85,86]}\"> Cell 1, row 2 \n</td><td data-parsoid=\"{&quot;tsr&quot;:[102,103]}\"> Cell 3, row 2 \n</td></tr></tbody></table>";

// The PHP parser strips the hash fragment for non-existent pages, but Parsoid does not.
// TODO: implement link target detection in a DOM postprocessor or on the client
// side.
testWhiteList["Broken link with fragment"] = "<p><a rel=\"mw:WikiLink\" href=\"Zigzagzogzagzig#zug\" data-parsoid=\"{&quot;tsr&quot;:[0,23],&quot;src&quot;:&quot;[[Zigzagzogzagzig#zug]]&quot;,&quot;bsp&quot;:[0,23],&quot;stx&quot;:&quot;simple&quot;}\">Zigzagzogzagzig#zug</a></p>";
testWhiteList["Nonexistent special page link with fragment"] = "<p><a rel=\"mw:WikiLink\" href=\"Special:ThisNameWillHopefullyNeverBeUsed#anchor\" data-parsoid=\"{&quot;tsr&quot;:[0,51],&quot;src&quot;:&quot;[[Special:ThisNameWillHopefullyNeverBeUsed#anchor]]&quot;,&quot;bsp&quot;:[0,51],&quot;stx&quot;:&quot;simple&quot;}\">Special:ThisNameWillHopefullyNeverBeUsed#anchor</a></p>";

testWhiteList["Fuzz testing: Parser22"] = "<p><a href=\"http://===r:::https://b\">http://===r:::https://b</a></p><table></table>";

/**
 * Small whitespace differences that we now start to care about for
 * round-tripping
 */

// Very minor whitespace difference at end of cell (MediaWiki inserts a
// newline before the close tag even if there was no trailing space in the cell)
//testWhiteList["Table rowspan"] = "<table border=\"1\"><tbody><tr><td> Cell 1, row 1 </td><td rowspan=\"2\"> Cell 2, row 1 (and 2) </td><td> Cell 3, row 1 </td></tr><tr><td> Cell 1, row 2 </td><td> Cell 3, row 2 </td></tr></tbody></table>";

// Inter-element whitespace only
//testWhiteList["Indented table markup mixed with indented pre content (proposed in bug 6200)"] = "   \n\n<table><tbody><tr><td><pre>\nText that should be rendered preformatted\n</pre></td></tr></tbody></table>";


/* Misc sanitizer / HTML5 differences */

// Single quotes are legal in HTML5 URIs. See
// http://www.whatwg.org/specs/web-apps/current-work/multipage/urls.html#url-manipulation-and-creation
testWhiteList["Link containing double-single-quotes '' (bug 4598)"] = "<p><a rel=\"mw:WikiLink\" href=\"Lista_d''e_paise_d''o_munno\" data-parsoid=\"{&quot;tsr&quot;:[0,31],&quot;contentPos&quot;:[0,31],&quot;src&quot;:&quot;[[Lista d''e paise d''o munno]]&quot;,&quot;bsp&quot;:[0,31],&quot;a&quot;:{&quot;href&quot;:&quot;Lista_d''e_paise_d''o_munno&quot;},&quot;sa&quot;:{&quot;href&quot;:&quot;Lista d''e paise d''o munno&quot;},&quot;stx&quot;:&quot;simple&quot;}\">Lista d''e paise d''o munno</a></p>";


// Sanitizer
// testWhiteList["Invalid attributes in table cell (bug 1830)"] = "<table><tbody><tr><td Cell:=\"\">broken</td></tr></tbody></table>";
// testWhiteList["Table security: embedded pipes (http://lists.wikimedia.org/mailman/htdig/wikitech-l/2006-April/022293.html)"] = "<table><tbody><tr><td> |<a href=\"ftp://|x||\">[1]</a>\" onmouseover=\"alert(document.cookie)\"&gt;test</td></tr></tbody></table>";

// We standardize on UTF8, so don't need to urlencode these chars any more.
testWhiteList["External link containing double-single-quotes with no space separating the url from text in italics"] = "<p><a href=\"http://www.musee-picasso.fr/pages/page_id18528_u1l2.htm\" rel=\"mw:ExtLink\" data-parsoid=\"{&quot;tsr&quot;:[0,146],&quot;bsp&quot;:[0,146]}\"><i>La muerte de Casagemas</i> (1901) en el sitio de </a><a rel=\"mw:WikiLink\" href=\"Museo_Picasso_(París)\" data-parsoid=\"{&quot;tsr&quot;:[105,144],&quot;src&quot;:&quot;[[Museo Picasso (París)|Museo Picasso]]&quot;,&quot;a&quot;:{&quot;href&quot;:&quot;Museo_Picasso_(París)&quot;},&quot;sa&quot;:{&quot;href&quot;:&quot;Museo Picasso (París)&quot;}}\">Museo Picasso</a>.</p>";

testWhiteList["External links: wiki links within external link (Bug 3695)"] = "<p><a href=\"http://example.com\" rel=\"mw:ExtLink\" data-parsoid=\"{&quot;tsr&quot;:[0,54],&quot;bsp&quot;:[0,54]}\"></a><a rel=\"mw:WikiLink\" href=\"Wikilink\" data-parsoid=\"{&quot;tsr&quot;:[20,32],&quot;contentPos&quot;:[20,32],&quot;src&quot;:&quot;[[wikilink]]&quot;,&quot;a&quot;:{&quot;href&quot;:&quot;Wikilink&quot;},&quot;sa&quot;:{&quot;href&quot;:&quot;wikilink&quot;},&quot;stx&quot;:&quot;simple&quot;}\">wikilink</a> embedded in ext link</p>";

// Most HTML entities are decoded in HTML output. That is fine, we are using UTF-8.
testWhiteList["Brackets in urls"] = "<p data-parsoid=\"{&quot;dsr&quot;:[0,46]}\"><a rel=\"mw:ExtLink/URL\" href=\"http://example.com/index.php?foozoid%5B%5D=bar\" data-parsoid=\"{&quot;tsr&quot;:[0,46],&quot;dsr&quot;:[0,46]}\">http://example.com/index.php?foozoid%5B%5D=bar</a></p>\n\n<p data-parsoid=\"{&quot;dsr&quot;:[48,100]}\"><a rel=\"mw:ExtLink/URL\" href=\"http://example.com/index.php?foozoid[]=bar\" data-parsoid=\"{&quot;tsr&quot;:[48,100],&quot;a&quot;:{&quot;href&quot;:&quot;http://example.com/index.php?foozoid[]=bar&quot;},&quot;sa&quot;:{&quot;href&quot;:&quot;http://example.com/index.php?foozoid&amp;#x5B;&amp;#x5D;=bar&quot;},&quot;dsr&quot;:[48,100]}\">http://example.com/index.php?foozoid[]=bar</a></p>";
testWhiteList["Table security: embedded pipes (http://lists.wikimedia.org/mailman/htdig/wikitech-l/2006-April/022293.html)"] = "<table data-parsoid=\"{&quot;tsr&quot;:[0,2],&quot;dsr&quot;:[0,63]}\">\n<tbody data-parsoid=\"{&quot;dsr&quot;:[3,61]}\"><tr data-parsoid=\"{&quot;dsr&quot;:[3,61]}\"><td data-parsoid=\"{&quot;tsr&quot;:[3,6],&quot;dsr&quot;:[3,15]}\">[<a rel=\"mw:ExtLink/URL\" href=\"ftp://|x\" data-parsoid=\"{&quot;tsr&quot;:[7,15],&quot;dsr&quot;:[7,15]}\">ftp://|x</a></td><td data-parsoid=\"{&quot;tsr&quot;:[15,17],&quot;stx_v&quot;:&quot;row&quot;,&quot;dsr&quot;:[15,61]}\">]\" onmouseover=\"alert(document.cookie)\"&gt;test</td></tr></tbody></table>";
testWhiteList["Piped link to URL"] = "<p data-parsoid=\"{&quot;dsr&quot;:[0,60]}\">Piped link to URL: [<a rel=\"mw:ExtLink\" href=\"http://www.example.com|an\" data-parsoid=\"{&quot;targetOff&quot;:46,&quot;tsr&quot;:[20,59],&quot;dsr&quot;:[20,59]}\">example URL</a>]</p>";


// This is valid, just confusing for humans. The reason for disallowing this
// might be history by now. XXX: Check this!
testWhiteList["Link containing % as a double hex sequence interpreted to hex sequence"] = "<p><a rel=\"mw:WikiLink\" href=\"7%2525_Solution\" data-parsoid=\"{&quot;tsr&quot;:[0,19],&quot;contentPos&quot;:[0,19],&quot;src&quot;:&quot;[[7%2525 Solution]]&quot;,&quot;bsp&quot;:[0,19],&quot;a&quot;:{&quot;href&quot;:&quot;7%2525_Solution&quot;},&quot;sa&quot;:{&quot;href&quot;:&quot;7%2525 Solution&quot;},&quot;stx&quot;:&quot;simple&quot;}\">7%25 Solution</a></p>";

// This is a test for stripping IDN ignored characters out of a link. The expected result (apparently) is that the IDN character
// should not be present in the text of the link. But Gabriel and Mark decided that that made very little sense. Hence, whitelist.
testWhiteList["External links: IDN ignored character reference in hostname; strip it right off"] = "<p><a rel=\"mw:ExtLink/URL\" href=\"http://example.com/\">http://e\u200cxample.com/</a></p>";

if (typeof module === "object") {
	module.exports.testWhiteList = testWhiteList;
}
