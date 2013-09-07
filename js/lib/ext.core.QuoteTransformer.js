"use strict";
/*
 * MediaWiki-compatible italic/bold handling as a token stream transformation.
 */

var Util = require('./mediawiki.Util.js').Util,
    defines = require('./mediawiki.parser.defines.js');
// define some constructor shortcuts
var NlTk = defines.NlTk,
    TagTk = defines.TagTk,
    SelfclosingTagTk = defines.SelfclosingTagTk,
    EndTagTk = defines.EndTagTk;

function QuoteTransformer ( dispatcher ) {
	this.reset();
	this.register( dispatcher );
}

// constants
QuoteTransformer.prototype.quoteAndNewlineRank = 2.1;
QuoteTransformer.prototype.anyRank = 2.101; // Just after regular quote and newline

QuoteTransformer.prototype.reset = function ( ) {
	// A chunk starts with a token context around a quote token and is
	// (optionally) followed by non-quote tokens. The quote token and its
	// context is later replaced with the actual tag token for italic or bold.
	this.currentChunk = [];
	// List of chunks, each starting with a (potentially) bold or italic token
	// and followed by plain tokens.
	this.chunks = [];
	// References to chunks in which the first token context / quote token
	// should be converted to italic or bold tokens.
	this.italics = [];
	this.bolds = [];

	this.isActive = false;
};


// Register this transformer with the TokenTransformer
QuoteTransformer.prototype.register = function ( dispatcher ) {
	this.dispatcher = dispatcher;
	// Register for QUOTE tag tokens
	dispatcher.addTransform( this.onQuote.bind(this), "QuoteTransformer:onQuote",
			this.quoteAndNewlineRank, 'tag', 'mw-quote' );
};

// Make a copy of the token context
QuoteTransformer.prototype._startNewChunk = function ( ) {
	this.chunks.push( this.currentChunk );
	this.currentChunk = [];
	this.currentChunk.pos = this.chunks.length - 1;
};

// Handle QUOTE tags. These are collected in italic/bold lists depending on
// the length of quote string. Actual analysis and conversion to the
// appropriate tag tokens is deferred until the next NEWLINE token triggers
// onNewLine.
QuoteTransformer.prototype.onQuote = function ( token, frame, prevToken ) {
	var qlen = token.value.length,
		ctx = {
			token: token,
			frame: frame,
			prevToken: prevToken
		},
		ctx2 = {
			frame: frame,
			prevToken: prevToken
		},
		tsr;

	if ( ! this.isActive ) {
		this.dispatcher.addTransform( this.onNewLine.bind(this), "QuoteTransformer:onNewLine",
				this.quoteAndNewlineRank, 'newline' );
		// Treat 'th' just the same as a newline
		this.dispatcher.addTransform( this.onNewLine.bind(this), "QuoteTransformer:onNewLine",
				this.quoteAndNewlineRank, 'tag', 'td' );
		// Treat 'td' just the same as a newline
		this.dispatcher.addTransform( this.onNewLine.bind(this), "QuoteTransformer:onNewLine",
				this.quoteAndNewlineRank, 'tag', 'th' );
		// Treat end-of-input just the same as a newline
		this.dispatcher.addTransform( this.onNewLine.bind(this), "QuoteTransformer:onNewLine:end",
				this.quoteAndNewlineRank, 'end' );
		// register for any token if not yet active
		this.dispatcher.addTransform( this.onAny.bind(this), "QuoteTransformer:onAny", this.anyRank, 'any' );
		this.isActive = true;
	}

	this._startNewChunk();

	switch (qlen) {
		case 2:
			this.currentChunk.push(ctx);
			this.italics.push(this.currentChunk);
			break;
		case 3:
			this.currentChunk.push(ctx);
			this.bolds.push(this.currentChunk);
			break;
		case 4:
			this.currentChunk.push( "'" );
			this._startNewChunk();
			this.currentChunk.push(ctx);
			this.bolds.push(this.currentChunk);
			break;
		case 5:
			// The order of italic vs. bold does not matter. Those are
			// processed in a fixed order, and any nesting issues are fixed up
			// by the HTML 5 tree builder. This does not always result in the
			// prettiest result, but at least it is always correct and very
			// convenient.

			tsr = ctx.token.dataAttribs ? ctx.token.dataAttribs.tsr : null;
			if ( tsr ) {
				ctx.token = ctx.token.clone();
				ctx.token.dataAttribs.tsr = [tsr[0], tsr[0] + 2];
			}
			this.currentChunk.push(ctx);
			this.italics.push(this.currentChunk);

			// Now for the bold..
			this._startNewChunk();
			ctx2.token = {
				attribs: ctx.token.attribs
			};
			if ( tsr ) {
				// Get the correct tsr range for the bold
				ctx2.token.dataAttribs = { tsr: [tsr[1] - 3, tsr[1]] };
			}
			this.currentChunk.push(ctx2);
			this.bolds.push(this.currentChunk);
			break;
		default: // longer than 5, only use the last 5 ticks
			var newvalue = token.value.substr(0, qlen - 5 );
			tsr = ctx.token.dataAttribs ? ctx.token.dataAttribs.tsr : null;
			// update tsr for italic token
			if ( tsr ) {
				ctx.token = ctx.token.clone();
				ctx.token.dataAttribs.tsr = [tsr[0] + qlen - 5, tsr[1] - 3];
			}

			this.currentChunk.push ( newvalue );
			this._startNewChunk();
			this.currentChunk.push(ctx);
			this.italics.push(this.currentChunk);

			// Now for the bold..
			this._startNewChunk();
			ctx2.token = {
				attribs: ctx.token.attribs
			};
			if ( tsr ) {
				// Get the correct tsr range for the bold
				ctx2.token.dataAttribs = { tsr: [tsr[1] - 3, tsr[1]] };
			}
			this.currentChunk.push(ctx2);
			this.bolds.push(this.currentChunk);
			break;
	}

	return {};
};

QuoteTransformer.prototype.onAny = function ( token, frame, prevToken ) {
	//console.warn('qt onAny: ' + JSON.stringify(token, null, 2));
	this.currentChunk.push( token );
	return {};
};

// Handle NEWLINE tokens, which trigger the actual quote analysis on the
// collected quote tokens so far.
QuoteTransformer.prototype.onNewLine = function (  token, frame, prevToken ) {
	var res;

	if( ! this.isActive ) {
		// Nothing to do, quick abort.
		return { token: token };
	}

	//token.rank = this.quoteAndNewlineRank;

	//console.warn('chunks: ' + JSON.stringify( this.chunks, null, 2 ) );

	//console.warn("onNewLine: " + this.italics.length + 'i/b' + this.bolds.length);
	// balance out tokens, convert placeholders into tags
	if (this.italics.length % 2 && this.bolds.length % 2) {
		var firstsingleletterword = -1,
			firstmultiletterword = -1,
			firstspace = -1;
		for (var j = 0; j < this.bolds.length; j++) {
			var ctx = this.bolds[j][0];
			var ctxPrevToken = ctx.prevToken;
			//console.warn("balancing!" + JSON.stringify(ctxPrevToken, null, 2));
			if (ctxPrevToken) {
				if (ctxPrevToken.constructor === String) {
					var lastchar = ctxPrevToken[ctxPrevToken.length - 1],
						secondtolastchar = ctxPrevToken[ctxPrevToken.length - 2];
					if (lastchar === ' ' && firstspace === -1) {
						firstspace = j;
					} else if (lastchar !== ' ') {
						if ( secondtolastchar === ' ' &&
								firstsingleletterword === -1)
						{
							firstsingleletterword = j;
						} else if ( firstmultiletterword === -1) {
							firstmultiletterword = j;
						}
					}
				} else if ( ( ctxPrevToken.constructor === NlTk ||
								ctxPrevToken.constructor === TagTk ||
								ctxPrevToken.constructor === SelfclosingTagTk ) &&
								firstmultiletterword === -1 ) {
					// This is an approximation, as the original doQuotes
					// operates on the source and just looks at space vs.
					// non-space. At least some tags are thus recognized as
					// words in the original implementation.
					firstmultiletterword = j;
				}
			}
		}

		// console.log("fslw: " + firstsingleletterword + "; fmlw: " + firstmultiletterword + "; fs: " + firstspace);

		// now see if we can convert a bold to an italic and
		// an apostrophe
		if (firstsingleletterword > -1) {
			this.convertBold(firstsingleletterword);
		} else if (firstmultiletterword > -1) {
			this.convertBold(firstmultiletterword);
		} else if (firstspace > -1) {
			this.convertBold(firstspace);
		} else if ( !this.bolds[0][0].prevToken ) {
			// In this block, there is no previous token for the first bold,
			// because the bold token is the first thing in the stream.
			// In that case, we need to treat that as being the first space,
			// basically, because the start of the string is basically a
			// start-of-word.
			this.convertBold( 0 );
		}
	}

	this.quotesToTags( this.italics, 'i' );
	this.quotesToTags( this.bolds, 'b' );

	this.currentChunk.push( token );
	this._startNewChunk();

	//console.warn('chunks: ' + JSON.stringify( this.chunks, null, 2 ) );

	// return all collected tokens including the newline
	res = { tokens: Array.prototype.concat.apply([], this.chunks) };


	// prepare for next line
	this.reset();

	// remove registrations
	this.dispatcher.removeTransform( this.quoteAndNewlineRank, 'end' );
	this.dispatcher.removeTransform( this.quoteAndNewlineRank, 'tag', 'td' );
	this.dispatcher.removeTransform( this.quoteAndNewlineRank, 'tag', 'th' );
	this.dispatcher.removeTransform( this.quoteAndNewlineRank, 'newline' );
	this.dispatcher.removeTransform( this.anyRank, 'any' );
	//console.warn( 'res:' + JSON.stringify( res, null, 2 ));

	return res;
};

// Convert a bold token to italic to balance an uneven number of both bold and
// italic tags. In the process, one quote needs to be converted back to text.
QuoteTransformer.prototype.convertBold = function ( i ) {
	var chunk = this.bolds[i],
		textToken = "'";
	if ( chunk.pos ) {
		this.chunks[chunk.pos].push( textToken );
	} else {
		// prepend another chunk
		this.chunks.unshift( [ textToken ] );
	}

	// delete from bolds
	this.bolds.splice(i, 1);

	this.italics.push(chunk);
	this.italics.sort(function(a,b) { return a.pos - b.pos; } );
};

// Convert italics/bolds into tags
QuoteTransformer.prototype.quotesToTags = function ( chunks, name ) {
	var toggle = true,
		t,
		j,
		newToken,
		nameToWidth = {
			b: 3,
			i: 2
		};

	for (j = 0; j < chunks.length; j++) {
		//console.warn( 'quotesToTags ' + name + ': ' + JSON.stringify( chunks, null, 2 ) );
		t = chunks[j][0].token;
		//console.warn( 'quotesToTags t: ' + JSON.stringify( t, null, 2));

		if(toggle) {
			newToken = new TagTk( name, t.attribs,
					// Mark last element as auto-closed
					j === chunks.length - 1 ? { autoInsertedEnd: 1 } : {} );
		} else {
			newToken = new EndTagTk( name, t.attribs, {} );
		}
		if (t.dataAttribs && t.dataAttribs.tsr) {
			var tsr = t.dataAttribs.tsr,
				len = tsr[1] - tsr[0];
			// Verify if we the tsr value is accurate
			// SSS FIXME: We could potentially adjust tsr based on length
			// but dont know yet whether to fix tsr[0] or tsr[1]
			if (len === nameToWidth[name]) {
				newToken.dataAttribs.tsr = Util.clone(tsr);
			} else {
				// we generally use the last quotes, so adjust the tsr to that
				newToken.dataAttribs.tsr = [tsr[1] - nameToWidth[name], tsr[1]];
			}
		}

		chunks[j][0] = newToken;

		toggle = !toggle;
	}
	if (!toggle) {
		// Add end tag
		this.currentChunk.push( new EndTagTk( name ) );
	}
};

if (typeof module === "object") {
	module.exports.QuoteTransformer = QuoteTransformer;
}
