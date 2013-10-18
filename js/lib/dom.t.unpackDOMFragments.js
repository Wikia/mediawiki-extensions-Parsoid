"use strict";

var DU = require('./mediawiki.DOMUtils.js').DOMUtils,
	Util = require('./mediawiki.Util.js').Util,
	Consts = require('./mediawiki.wikitext.constants.js').WikitextConstants,
	computeNodeDSR = require('./dom.computeDSR.js').computeNodeDSR,
	DOMTraverser = require('./domTraverser.js').DOMTraverser,
	wrapTemplatesInTree = require('./dom.wrapTemplates.js').wrapTemplatesInTree;

function hasBadNesting(targetNode, fragment) {
	// SSS FIXME: This is not entirely correct. This is only
	// looking for nesting of identical tags. But, HTML tree building
	// has lot more restrictions on nesting. It seems the simplest way
	// to get all the rules right is to (serialize + reparse).

	function isNestableElement(nodeName) {
		// A-tags cannot ever be nested inside each other at any level.
		// This is the one scenario we definitely have to handle right now.
		// We need a generic robust solution for other nesting scenarios.
		return nodeName !== 'A';
	}

	return !isNestableElement(targetNode.nodeName) &&
		DU.treeHasElement(fragment, targetNode.nodeName);
}

function fixUpMisnestedTagDSR(targetNode, fragment) {
	// Currently, this only deals with A-tags
	if (targetNode.nodeName !== 'A') {
		return;
	}

	// Walk the fragment till you find an 'A' tag and
	// zero out DSR width for all tags from that point on.
	// This also requires adding span wrappers around
	// bare text from that point on.

	// QUICK FIX: Add wrappers unconditionally and strip unneeded ones
	// Since this scenario should be rare in practice, I am going to
	// go with this simple solution.
	DU.addSpanWrappers(fragment.childNodes);

	var resetDSR = false,
		currOffset = 0,
		dsrFixer = new DOMTraverser();
	dsrFixer.addHandler(null, function(node) {
		if (DU.isElt(node)) {
			if (node.nodeName === 'A') {
				resetDSR = true;
			}

			DU.loadDataParsoid(node);
			if (resetDSR) {
				if (node.data.parsoid.dsr && node.data.parsoid.dsr[0]) {
					currOffset = node.data.parsoid.dsr[1] = node.data.parsoid.dsr[0];
				} else {
					node.data.parsoid.dsr = [currOffset, currOffset];
				}
				node.data.parsoid.misnested = true;
				DU.setDataParsoid(node, node.data.parsoid);
			} else if (node.data.parsoid.tmp.wrapper) {
				// Unnecessary wrapper added above -- strip it.
				var next = node.nextSibling;
				DU.migrateChildren(node, node.parentNode, node);
				DU.deleteNode(node);
				return next;
			}
		}

		return true;
	});
	dsrFixer.traverse(fragment);

	// Since targetNode will get re-organized, save data.parsoid
	var dsrSaver = new DOMTraverser(),
		saveHandler = function(node) {
			if (DU.isElt(node) && node.data.parsoid.dsr) {
				DU.setDataParsoid(node, node.data.parsoid);
			}

			return true;
		};
	dsrSaver.addHandler(null, saveHandler);
	dsrSaver.traverse(targetNode);
	// Explicitly run on 'targetNode' since DOMTraverser always
	// processes children of node passed in, not the node itself
	saveHandler(targetNode);
}

function addDeltaToDSR(node, delta) {
	// Add 'delta' to dsr[0] and dsr[1] for nodes in the subtree
	// node's dsr has already been updated
	var child = node.firstChild;
	while (child) {
		if (DU.isElt(child)) {
			DU.loadDataParsoid(child);
			if (child.data.parsoid.dsr) {
				// SSS FIXME: We've exploited partial DSR information
				// in propagating DSR values across the DOM.  But, worth
				// revisiting at some point to see if we want to change this
				// so that either both or no value is present to eliminate these
				// kind of checks.
				//
				// Currently, it can happen that one or the other
				// value can be null.  So, we should try to udpate
				// the dsr value in such a scenario.
				if (typeof(child.data.parsoid.dsr[0]) === 'number') {
					child.data.parsoid.dsr[0] += delta;
				}
				if (typeof(child.data.parsoid.dsr[1]) === 'number') {
					child.data.parsoid.dsr[1] += delta;
				}
			}
			addDeltaToDSR(child, delta);
		}
		child = child.nextSibling;
	}
}

function fixAbouts(env, node, aboutIdMap) {
	var c = node.firstChild;
	while (c) {
		if (DU.isElt(c)) {
			var cAbout = c.getAttribute("about");
			if (cAbout) {
				// Update about
				var newAbout = aboutIdMap.get(cAbout);
				if (!newAbout) {
					newAbout = env.newAboutId();
					aboutIdMap.set(cAbout, newAbout);
				}
				c.setAttribute("about", newAbout);
			}

			fixAbouts(env, c, aboutIdMap);
		}

		c = c.nextSibling;
	}
}

function makeChildrenEncapWrappers(node, about) {
	DU.addSpanWrappers(node.childNodes);

	var c = node.firstChild;
	while (c) {
		// FIXME: This unconditionally sets about on children
		// This is currently safe since all of them are nested
		// inside a transclusion, but do we need future-proofing?
		c.setAttribute("about", about);
		c = c.nextSibling;
	}
}

/**
* DOMTraverser handler that unpacks DOM fragments which were injected in the
* token pipeline.
*/
function unpackDOMFragments(env, node) {
	if (DU.isElt(node)) {
		var typeOf = node.getAttribute('typeof'),
			about = node.getAttribute('about'),
			lastNode = node;
		if (/(?:^|\s)mw:DOMFragment(?=$|\s)/.test(typeOf)) {
			// Replace this node and possibly a sibling with node.dp.html
			var fragmentParent = node.parentNode,
				dummyNode = node.ownerDocument.createElement(fragmentParent.nodeName);

			if (!node.data || !node.data.parsoid) {
				// FIXME gwicke: This normally happens on Fragment content
				// inside other Fragment content. Print out some info about
				// the culprit for now.
				var out = 'undefined data.parsoid: ',
					workNode = node;
				while(workNode && workNode.getAttribute) {
					out += workNode.nodeName + '-' +
						workNode.getAttribute('about') + '-' +
						workNode.getAttribute('typeof') + '|';
					workNode = workNode.parentNode;
				}
				// SSS FIXME: Missing debug statment here?
				// 'out' is not being used.
				DU.loadDataParsoid(node);
			}

			var html = node.data.parsoid.html;
			if (!html || /(?:^|\s)mw:Transclusion(?=$|\s)/.test(typeOf)) {
				// Ex: A multi-part template with an extension in its
				// output (possibly passed in as a parameter).
				//
				// Example:
				// echo '{{echo|<math>1+1</math>}}' | node parse --extensions math
				//
				// Simply remove the mw:DOMFragment typeof for now, as the
				// entire content will still be encapsulated as a
				// mw:Transclusion.
				DU.removeTypeOf(node, 'mw:DOMFragment');
				return true;
			}

			dummyNode.innerHTML = html;

			// get rid of the wrapper sibling (simplifies logic below)
			var sibling = node.nextSibling;
			if (about !== null && sibling && DU.isElt(sibling) &&
					sibling.getAttribute('about') === about)
			{
				// remove optional second element added by wrapper tokens
				lastNode = sibling;
				DU.deleteNode(sibling);
			}

			var contentNode = dummyNode.firstChild;

			// Update DSR
			//
			// There is currently no DSR for DOMFragments nested inside
			// transclusion / extension content (extension inside template
			// content etc).
			// TODO: Make sure that is the only reason for not having a DSR here.
			var dsr = node.data.parsoid.dsr;
			if (dsr) {
				// Load data-parsoid attr so we can use firstChild.data.parsoid
				DU.loadDataParsoid(contentNode);
				if (!contentNode.data.parsoid) {
					console.log(node.data.parsoid, dummyNode.outerHTML);
				}

				var type = contentNode.getAttribute("typeof");
				if (/(?:^|\s)mw:(Transclusion|Extension)(?=$|\s)/.test(type)) {
					contentNode.data.parsoid.dsr = [dsr[0], dsr[1]];
				} else { // non-transcluded images
					contentNode.data.parsoid.dsr = [dsr[0], dsr[1], 2, 2];
					// Reused image -- update dsr by tsrDelta on all
					// descendents of 'firstChild' which is the <figure> tag
					var tsrDelta = node.data.parsoid.tsrDelta;
					if (tsrDelta) {
						addDeltaToDSR(contentNode, tsrDelta);
					}
				}

			}

			var n;
			if (node.data.parsoid.tmp.isForeignContent) {
				// Foreign Content = Transclusion and Extension content
				//
				// Set about-id always to ensure the unwrapped node
				// is recognized as encapsulated content as well.
				n = dummyNode.firstChild;
				while (n) {
					if (DU.isElt(n)) {
						n.setAttribute("about", about);
					}
					n = n.nextSibling;
				}
			} else {
				// Replace old about-id with new about-id that is
				// unique to the global page environment object.
				//
				// <figure>s are reused from cache. Note that figure captions
				// can contain multiple independent transclusions. Each one
				// of those individual transclusions should get a new unique
				// about id. Hence a need for an aboutIdMap and the need to
				// walk the entire tree.

				fixAbouts(env, dummyNode, new Map());

				// Discard unnecessary span wrappers
				n = dummyNode.firstChild;
				while (n) {
					var next = n.nextSibling;

					// Preserve wrappers that have an about id
					if (DU.isElt(n) && !n.getAttribute('about')) {
						DU.loadDataParsoid(n);
						if (n.data.parsoid.tmp.wrapper) {
							DU.migrateChildren(n, n.parentNode, n);
							DU.deleteNode(n);
						}
					}

					n = next;
				}
			}

			var nextNode = node.nextSibling;
			if (hasBadNesting(fragmentParent, dummyNode)) {
				/*------------------------------------------------------------------------
				 * If fragmentParent is an A element and the fragment contains another
				 * A element, we have an invalid nesting of A elements and needs fixing up
				 *
				 * doc1: ... fragmentParent -> [... dummyNode=mw:DOMFragment, ...] ...
				 *
				 * 1. Change doc1:fragmentParent -> [... "#unique-hash-code", ...] by replacing
				 *    node with the "#unique-hash-code" text string
				 *
				 * 2. str = fragmentParent.outerHTML.replace(#unique-hash-code, dummyNode.innerHTML)
				 *    We now have a HTML string with the bad nesting. We will now use the HTML5
				 *    parser to parse this HTML string and give us the fixed up DOM
				 *
				 * 3. ParseHTML(str) to get
				 *    doc2: [BODY -> [[fragmentParent -> [...], nested-A-tag-from-dummyNode, ...]]]
				 *
				 * 4. Replace doc1:fragmentParent with doc2:body.childNodes
				 * ----------------------------------------------------------------------- */
				var timestamp = (new Date()).toString();
				fragmentParent.replaceChild(node.ownerDocument.createTextNode(timestamp), node);

				// If fragmentParent has an about, it presumably is nested inside a template
				// Post fixup, its children will surface to the encapsulation wrapper level.
				// So, we have to fix them up so they dont break the encapsulation.
				//
				// Ex: {{echo|[http://foo.com This is [[bad]], very bad]}}
				//
				// In this example, the <a> corresponding to Foo is fragmentParent and has an about
				// dummyNode is the DOM corresponding to "This is [[bad]], very bad". Post-fixup
				// [[bad], very bad are at encapsulation level and need about ids.
				about = fragmentParent.getAttribute("about");
				if (about !== null) {
					makeChildrenEncapWrappers(dummyNode, about);
				}

				// 1. Set zero-dsr width on all elements that will get split
				//    in dummyNode's tree to prevent selser-based corruption
				//    on edits to a page that contains badly nested tags.
				// 2. Save data-parsoid on fragmentParent since it will be
				//    modified below and we want data.parsoid preserved.
				fixUpMisnestedTagDSR(fragmentParent, dummyNode);

				// We rely on HTML5 parser to fixup the bad nesting (see big comment above)
				var newDoc = DU.parseHTML(fragmentParent.outerHTML.replace(timestamp, dummyNode.innerHTML));
				DU.migrateChildrenBetweenDocs(newDoc.body, fragmentParent.parentNode, fragmentParent);

				// Set nextNode to the previous-sibling of former fragmentParent (which will get deleted)
				// This will ensure that all nodes will get handled
				nextNode = fragmentParent.previousSibling;

				// fragmentParent itself is useless now
				DU.deleteNode(fragmentParent);
			} else {
				// Move the content nodes over and delete the placeholder node
				DU.migrateChildren(dummyNode, fragmentParent, node);
				DU.deleteNode(node);
			}

			return nextNode;
		}
	}
	return true;
}

if (typeof module === "object") {
	module.exports.unpackDOMFragments = unpackDOMFragments;
}
