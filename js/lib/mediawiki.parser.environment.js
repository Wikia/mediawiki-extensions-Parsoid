"use strict";

var WikiConfig = require( './mediawiki.WikiConfig.js' ).WikiConfig,
	ParsoidConfig = require( './mediawiki.ParsoidConfig.js' ).ParsoidConfig,
	ConfigRequest = require( './mediawiki.ApiRequest.js' ).ConfigRequest,
	$ = require( './fakejquery' ),
	Title = require('./mediawiki.Title.js').Title;

function Tracer(env) {
	this.env = env;
}
Tracer.prototype = {
	startPass: function(string) {
		if (this.env.conf.parsoid.trace) {
			console.warn("---- start: " + string + " ----");
		}
	},

	endPass: function(string) {
		if (this.env.conf.parsoid.trace) {
			console.warn("---- end  : " + string + " ----");
		}
	},

	traceToken: function(token, compact) {
		if (compact === undefined) {
			compact = true;
		}

		if (this.env.conf.parsoid.trace) {
			if (token.constructor === String || token.constructor === Number) {
				console.warn("T: '" + token + "'");
			} else  {
				console.warn("T: " + token.toString(compact));
			}
		}
	},

	output: function(string) {
		if (this.env.conf.parsoid.trace) {
			console.warn(string);
		}
	},

	outputChunk: function(chunk) {
		if (this.env.conf.parsoid.trace) {
			console.warn("---- <chunk:tokenized> ----");
			for (var i = 0, n = chunk.length; i < n; i++) {
				console.warn(chunk[i].toString());
			}
			console.warn("---- </chunk:tokenized> ----");
		}
	}
};

/**
 * @class
 *
 * Holds configuration data that isn't modified at runtime, debugging objects,
 * a page object that represents the page we're parsing, and more.
 *
 * @constructor
 * @param {ParsoidConfig/null} parsoidConfig
 * @param {WikiConfig/null} wikiConfig
 */
var MWParserEnvironment = function ( parsoidConfig, wikiConfig ) {
	// page information
	this.page = {
		name: 'Main page',
		relativeLinkPrefix: '',
		id: null,
		src: null,
		dom: null,
		ns: null,
		title: null // a full Title object
	};

	// A passed-in cookie, if any
	this.cookie = null;

	// Configuration
	this.conf = {};

	// execution state
	// TODO gwicke: probably not that useful any more as this is per-request
	// and the PHP preprocessor eliminates template source hits
	this.pageCache = {};
	// Global transclusion expansion cache (templates, parser functions etc)
	// Key: Full transclusion source
	this.transclusionCache = {};
	// Global extension tag expansion cache (templates, parser functions etc)
	// Key: Full extension source (including tags)
	this.extensionCache = {};
	// Global image expansion cache
	// Key: Full image source
	this.fileCache = {};

	if ( !parsoidConfig ) {
		// Global things, per-parser
		parsoidConfig = new ParsoidConfig( null, null );
	}

	if ( !wikiConfig ) {
		// Local things, per-wiki
		wikiConfig = new WikiConfig( null, '' );
	}

	this.conf.wiki = wikiConfig;
	this.conf.parsoid = parsoidConfig;
	this.performance = {};

	this.reset( this.page.name );

	// Tracing object
	this.tracer = new Tracer(this);

	// Outstanding page requests (for templates etc)
	this.requestQueue = {};
};

// Cache for wiki configurations, shared between requests.
MWParserEnvironment.prototype.confCache = {};

/**
 * @property {Object} page
 * @property {string} page.name
 * @property {String/null} page.src
 * @property {Node/null} page.dom
 * @property {string} page.relativeLinkPrefix
 * Any leading ..?/ strings that will be necessary for building links.
 * @property {Number/null} page.id
 * The revision ID we want to use for the page.
 */
/**
 * @method
 *
 * Set the src and optionally meta information for the page we're parsing.
 *
 * If the argument is a simple string, will clear metadata and just
 * set this.page.src.  Otherwise, the provided metadata object should
 * have fields corresponding to the JSON output given by
 * action=query&prop=revisions on the MW API.  That is:
 * <pre>
 *  metadata = {
 *    title: // normalized title (ie, spaces not underscores)
 *    ns:    // namespace
 *    id:    // page id
 *    revision: {
 *      revid:    // revision id
 *      parentid: // revision parent
 *      timestamp:
 *      user:     // contributor username
 *      userid:   // contributor user id
 *      sha1:
 *      size:     // in bytes
 *      comment:
 *      contentmodel:
 *      contentformat:
 *      "*":     // actual source text --> copied to this.page.src
 *    }
 *  }
 * </pre>
 *
 * @param {String or Object} page source or metadata
 */
MWParserEnvironment.prototype.setPageSrcInfo = function ( src_or_metadata ) {
	if (typeof(src_or_metadata)==='string' || src_or_metadata===null) {
		this.page.meta = { revision: {} };
		this.page.src = src_or_metadata;
		return;
	}
	// I'm chosing to initialize this.page.meta "the hard way" (rather than
	// simply cloning the provided object) in part to document/enforce the
	// expected structure and fields.
	var metadata = src_or_metadata;
	var m = this.page.meta;
	if (!m) { m = this.page.meta = {}; }
	m.title = metadata.title;
	m.ns = metadata.ns;
	m.id = metadata.id;
	var r = m.revision;
	if (!r) { r = m.revision = {}; }
	if (metadata.revision) {
		r.revid = metadata.revision.revid;
		r.parentid = metadata.revision.parentid;
		r.timestamp = metadata.revision.timestamp;
		r.user = metadata.revision.user;
		r.userid = metadata.revision.userid;
		r.sha1 = metadata.revision.sha1;
		r.size = metadata.revision.size;
		r.comment = metadata.revision.comment;
		r.contentmodel = metadata.revision.contentmodel;
		r.contentformat = metadata.revision.contentformat;
		if ('*' in metadata.revision) {
			this.page.src = metadata.revision['*'];
		}
	}
};

/**
 * @property {Object} conf
 * @property {WikiConfig} conf.wiki
 * @property {ParsoidConfig} conf.parsoid
 */


/**
 * @method
 *
 * Reset the environment for the page
 *
 * @param {string} pageName
 */
MWParserEnvironment.prototype.reset = function ( pageName ) {
	// Create a title from the pageName
	var title = Title.fromPrefixedText(this, pageName);
	this.page.ns = title.ns.id;
	this.page.title = title;
	this.initUID();

	this.page.name = pageName;
	// Construct a relative link prefix depending on the number of slashes in
	// pageName
	this.page.relativeLinkPrefix = '';
	var slashMatches = this.page.name.match(/\//g),
		numSlashes = slashMatches ? slashMatches.length : 0;
	if ( numSlashes ) {
		while ( numSlashes ) {
			this.page.relativeLinkPrefix += '../';
			numSlashes--;
		}
	} else {
		// Always prefix a ./ so that we don't have to escape colons. Those
		// would otherwise fool browsers into treating namespaces as
		// protocols.
		this.page.relativeLinkPrefix = './';
	}
	this.performance.start = new Date().getTime();
};

MWParserEnvironment.prototype.getVariable = function( varname, options ) {
	//XXX what was the original author's intention?
	//something like this?:
	//  return this.options[varname];
	return this[varname];
};

MWParserEnvironment.prototype.setVariable = function( varname, value, options ) {
	this[varname] = value;
};

/**
 * @method
 * @static
 *
 * Alternate constructor for MWParserEnvironments
 *
 * @param {ParsoidConfig/null} parsoidConfig
 * @param {WikiConfig/null} wikiConfig
 * @param {string} prefix The interwiki prefix that corresponds to the wiki we should use
 * @param {string} pageName
 * @param {Function} cb
 * @param {Error} cb.err
 * @param {MWParserEnvironment} cb.env The finished environment object
 */
MWParserEnvironment.getParserEnv = function ( parsoidConfig, wikiConfig, apiSource, pageName, cookie, cb ) {
	if ( !parsoidConfig ) {
		parsoidConfig = new ParsoidConfig();
		parsoidConfig.setInterwiki( 'mw', 'http://www.mediawiki.org/w/api.php' );
	}

	if ( !wikiConfig ) {
		wikiConfig = new WikiConfig( null, null );
	}

	var env = new MWParserEnvironment( parsoidConfig, wikiConfig );
	env.cookie = cookie;

	if ( pageName ) {
		env.reset( pageName );
	}

	// Get that wiki's config
	env.switchToConfig( apiSource, function ( err ) {
		cb( err, env );
	} );
};

/**
 * Build a string representing a set of parameters, suitable for use
 * as the value of an HTTP header. Performs no escaping.
 * @returns {string}
 */
MWParserEnvironment.prototype.getPerformanceHeader = function () {
	var p = this.performance;

	if ( p.start && !p.duration ) {
		p.duration = ( new Date().getTime() ) - p.start;
	}

	return Object.keys( p ).sort().map( function ( k ) {
		return [ k, p[k] ].join( '=' );
	} ).join( '; ' );
};

MWParserEnvironment.prototype.isApiSourceAUri = function( apiSource ) {
	return ( /^https?:\/\/(.*)/gi ).test( apiSource );
};

/**
 * Function that switches to a different configuration for a different wiki.
 * Caches all configs so we only need to get each one once (if we do it right)
 *
 * @param {string} prefix The interwiki prefix that corresponds to the wiki we should use
 * @param {Function} cb
 * @param {Error} cb.err
 */
MWParserEnvironment.prototype.switchToConfig = function ( apiSource, cb ) {
	var isUri = this.isApiSourceAUri( apiSource );

	function setupWikiConfig(env, apiURI, error, config) {
		if ( error === null ) {
			env.conf.wiki = new WikiConfig( config, apiSource, apiURI );
			env.confCache[apiSource] = env.conf.wiki;
		}

		cb( error );
	}

	if (!apiSource) {
		console.error("ERROR: No valid prefix or API URI provided!");
		cb(new Error("Wiki prefix or API URI not provided"));
		return;
	}

	var uri;

	if ( isUri ) {
		uri = apiSource;
	} else {
		uri = this.conf.parsoid.interwikiMap[ apiSource ];

		if (!uri) {
			// SSS: Ugh! Looks like parser tests use a prefix
			// that is not part of the interwikiMap -- so we
			// cannot crash with an error.  Hence defaulting
			// to enwiki api which is quite odd.  Does the
			// interwikiMap need updating or is this use-case
			// valid outside of parserTests??
			console.error("ERROR: Did not find api uri for " + apiSource + "; defaulting to en");
			uri = this.conf.parsoid.interwikiMap.en;
		}
	}

	this.conf.parsoid.apiURI = uri;

	if ( this.confCache[ apiSource ] ) {
		this.conf.wiki = this.confCache[ apiSource ];
		cb( null );
	} else if ( this.conf.parsoid.fetchConfig || isUri ) {
		var confRequest = new ConfigRequest( uri, this );
		confRequest.on( 'src', setupWikiConfig.bind(null, this, uri));
	} else {
		// Load the config from cached config on disk
		var localConfigFile = './baseconfig/' + apiSource + '.json',
			localConfig = require(localConfigFile);

		if (localConfig && localConfig.query) {
			setupWikiConfig(this, uri, null, localConfig.query);
		} else {
			cb(new Error("Could not read valid config from file: " + localConfigFile));
		}
	}
};

// XXX: move to Title!
MWParserEnvironment.prototype.normalizeTitle = function( name, noUnderScores,
		preserveLeadingColon )
{
	if (typeof name !== 'string') {
		throw new Error('nooooooooo not a string');
	}
	var forceNS, self = this;
	if ( name.substr( 0, 1 ) === ':' ) {
		forceNS = preserveLeadingColon ? ':' : '';
		name = name.substr(1);
	} else {
		forceNS = '';
	}


	name = name.trim();
	if ( ! noUnderScores ) {
		name = name.replace(/[\s_]+/g, '_');
	}

	// Implement int: as alias for MediaWiki:
	if ( name.substr( 0, 4 ) === 'int:' ) {
		name = 'MediaWiki:' + name.substr( 4 );
	}

	// FIXME: Generalize namespace case normalization
	if ( name.substr( 0, 10 ).toLowerCase() === 'mediawiki:' ) {
		name = 'MediaWiki:' + name.substr( 10 );
	}

	function upperFirst( s ) { return s.substr( 0, 1 ).toUpperCase() + s.substr(1); }

	function splitNS ( ) {
		var nsMatch = name.match( /^([a-zA-Z\-]+):/ ),
			ns = nsMatch && nsMatch[1] || '';
		if( ns !== '' && ns !== name ) {
			if ( self.conf.parsoid.interwikiMap[ns.toLowerCase()] ) {
				forceNS += ns + ':';
				name = name.substr( nsMatch[0].length );
				splitNS();
			} else {
				name = upperFirst( ns ) + ':' + upperFirst( name.substr( ns.length + 1 ) );
			}
		} else if ( !self.conf.wiki.caseSensitive ) {
			name = upperFirst( name );
		}
	}
	splitNS();
	//name = name.split(':').map( upperFirst ).join(':');
	//if (name === '') {
	//	throw new Error('Invalid/empty title');
	//}
	return forceNS + name;
};

/**
 * TODO: Handle namespaces relative links like [[User:../../]] correctly, they
 * shouldn't be treated like links at all.
 */
MWParserEnvironment.prototype.resolveTitle = function( name, namespace ) {
	// Default to main namespace
	namespace = namespace || 0;
	if ( /^#/.test( name ) ) {
		// resolve lonely fragments (important if this.page is a subpage,
		// otherwise the relative link will be wrong)
		name = this.page.name + name;
	}
	if ( this.conf.wiki.namespacesWithSubpages[namespace] ) {
		// Resolve subpages
		var relUp = name.match(/^(\.\.\/)+/);
		if ( relUp ) {
			var levels = relUp[0].length / 3, // Levels are indicated by '../'.
			    titleBits = this.page.name.split( /\// ),
			    newBits = titleBits.slice( 0, titleBits.length - levels );
			if ( name !== relUp[0] ) {
				newBits.push( name.substr( levels * 3 ) );
			}
			name = this.normalizeTitle( newBits.join('/') );
		}

		// Resolve absolute subpage links
		if ( name.length && name[0] === '/' ) {
			// Remove final slash if present.
			name = name.replace( /\/$/, '' );
			name = this.normalizeTitle( this.page.name + name );
		}
	}

	// Strip leading ':'
	if (name[0] === ':') {
		name = name.substr( 1 );
	}

	return name;
};

/**
 * Simple debug helper
 */
MWParserEnvironment.prototype.dp = function ( ) {
	if ( this.conf.parsoid.debug ) {
		if ( arguments.length > 1 ) {
			try {
				console.warn( JSON.stringify( arguments, null, 2 ) );
			} catch ( e ) {
				console.trace();
				console.warn( e );
			}
		} else {
			console.warn( arguments[0] );
		}
	}
};

/**
 * Even simpler debug helper that always prints..
 */
MWParserEnvironment.prototype.ap = function ( ) {
	if ( arguments.length > 1 ) {
		try {
			console.warn( JSON.stringify( arguments, null, 2 ) );
		} catch ( e ) {
			console.warn( e );
		}
	} else {
		console.warn( arguments[0] );
	}
};
/**
 * Simple debug helper, trace-only
 */
MWParserEnvironment.prototype.tp = function ( ) {
	if ( this.conf.parsoid.debug || this.conf.parsoid.trace ) {
		if ( arguments.length > 1 ) {
			console.warn( JSON.stringify( arguments, null, 2 ) );
		} else {
			console.warn( arguments[0] );
		}
	}
};

MWParserEnvironment.prototype.initUID = function() {
	this.uid = 1;
};

/**
 * @method
 * @private
 *
 * Generate a UID
 *
 * @returns {number}
 */
MWParserEnvironment.prototype.generateUID = function () {
	return this.uid++;
};

MWParserEnvironment.prototype.newObjectId = function () {
	return "mwt" + this.generateUID();
};

MWParserEnvironment.prototype.newAboutId = function () {
	return "#" + this.newObjectId();
};

MWParserEnvironment.prototype.stripIdPrefix = function(aboutId) {
	return aboutId.replace(/^#?mwt/, '');
};

MWParserEnvironment.prototype.isParsoidObjectId = function(aboutId) {
	return aboutId.match(/^#mwt/);
};

/**
 * Default implementation of an error callback for async
 * error reporting in the parser pipeline.
 *
 * For best results, define your own. For better results,
 * call it from places you notice errors happening.
 *
 * @template
 * @param {Error} error
 */
MWParserEnvironment.prototype.errCB = function ( error ) {
	console.log( 'ERROR in ' + this.page.name + ':\n' + error.message);
	console.log("Stack trace: " + error.stack);
	process.exit( 1 );
};


if (typeof module === "object") {
	module.exports.MWParserEnvironment = MWParserEnvironment;
}
