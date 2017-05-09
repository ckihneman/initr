/*! Initr - v1.0.0 - 2017-05-08
* https://github.com/ckihneman/initr
* Copyright (c) 2017 Chris Kihneman Licensed MIT */
( function( $, window, undefined ) {

var initr, types;

function Initr( rootPath, deps ) {
	this.rootPath = rootPath || '';
	this.deps = deps;
	this.events = {};
	this.done = {};

	// A pre-resolved promise for use when files were bundled with the core.
	this.preResolved = $.Deferred().resolve().promise();

	this.getDeps( deps );
}

Initr.charWait = '!';

Initr.prototype.getDeps = function( deps ) {

	// Make sure we have dependencies to load
	if ( !( deps && deps.length ) ) {
		if ( initr.isDev ) {
			console.log( '! Initr - no dependencies passed.' );
		}
		return;
	}

	// Load and run each dependency
	for ( var i = 0, l = deps.length; i < l; i++ ) {
		this.getDep( deps[ i ] );
	}
};

Initr.prototype.getDep = function( dep, isLoaded ) {
	var $els,
		_this = this;

	// Check to see if selector is on current page
	if ( dep.selector ) {
		$els = $( dep.selector );

		// If no matched elements, stop
		if ( !$els.length ) {
			if ( initr.isDev ) {
				console.log( '! Initr - selector did not match any elements.', dep );
			}
			return;
		}
	}

	// Check validate method if it exists
	if ( dep.validate ) {

		// If validate returns false, stop
		if ( !dep.validate( $els, dep ) ) {
			if ( initr.isDev ) {
				console.log( '! Initr - validate function did not pass.', dep );
			}
			return;
		}
	}

	// Check for scripts to load
	if ( dep.src && !isLoaded ) {
		this.loadDep( dep )
			.done( function() {
				_this.initDep( dep, $els );
			})
			.fail( function() {
				if ( initr.isDev ) {
					console.log( '! Initr:error - failed to load dependencies.', dep );
				}
			});
	} else {
		this.initDep( dep, $els );
	}
};

// Must return a promise.
Initr.prototype.loadDep = function( dep ) {
	var scripts, groups;

	// Handle bundled file for production.
	if ( !initr.isDev && dep.bundle ) {
		if ( typeof dep.bundle === 'string' ) {
			return Initr.getScripts( [ dep.bundle ], this.rootPath );
		} else {
			return this.preResolved;
		}
	}

	// Handle single script loading.
	if ( typeof dep.src === 'string' ) {
		return Initr.getScripts( [dep.src], this.rootPath );
	}

	// Handle groups of files.
	scripts = dep.src;
	groups = this.getScriptGroups( scripts );

	// If we don't have to wait on any groups of scripts to load,
	// just load all of the scripts async.
	if ( !groups ) {
		return Initr.getScripts( scripts, this.rootPath );
	}

	// If we need to wait on groups of scripts to load,
	// then load them in groups.
	return this.loadScriptGroups( groups );
};

Initr.prototype.getScriptGroups = function( scripts ) {
	var isWait, isGroups, script,
		groups = [],
		groupIndex = 0,
		i = 0,
		l = scripts.length;
	for ( ; i < l; i++ ) {
		script = scripts[ i ];
		isWait = script[0] === Initr.charWait;
		groups[groupIndex] = groups[groupIndex] || [];

		groups[groupIndex].push( !isWait ? script : script.substring(1) );

		if ( isWait ) {
			isGroups = true;
			groupIndex += 1;
		}
		isWait = false;
	}
	return isGroups ? groups : false;
};

Initr.prototype.loadScriptGroups = function( groups ) {
	var deferred, group,
		i = 0,
		l = groups.length;
	for ( ; i < l; i++ ) {
		group = groups[ i ];
		if ( !deferred ) {
			deferred = Initr.getScripts( group, this.rootPath );
		} else {
			deferred = deferred.then( this.thenCallback(group) );
		}
	}
	return deferred;
};

Initr.prototype.thenCallback = function( group ) {
	var _this = this;
	return function() {
		return Initr.getScripts( group, _this.rootPath );
	};
};

Initr.prototype.initDep = function( dep, $els ) {
	var type = types[ dep.type ];
	if ( dep.type && type ) {
		return type.run.call( this, dep, $els, type );
	}
	if ( dep.init ) {
		if ( initr.isDev ) {
			console.log( '- Initr:anonymous -', dep );
		}
		dep.init( $els, dep );
	} else {
		if ( initr.isDev ) {
			console.log( '! Initr:error:anonymous - no `init` function.', dep );
		}
	}
};

// Event Handling
Initr.prototype.on = function( eventName, callback ) {
	var events;

	if ( !(eventName && callback) ) {
		return;
	}
	eventName = Initr.normalizeEventName( eventName );
	events = this.events[ eventName ];

	if ( !events ) {
		events = $.Callbacks();
		this.events[ eventName ] = events;
	}
	events.add( callback );

	var doneArr = this.done[ eventName.split(':')[0] ];
	if ( doneArr ) {
		callback.apply( null, doneArr );
	}
};

Initr.prototype.trigger = function( eventName, $els, dep ) {
	if ( !(eventName && this.events[eventName]) ) {
		return;
	}
	this.events[eventName].fire( $els, dep );
};

Initr.prototype.run = function( depName ) {
	var doneArr = this.done[ depName ];
	if ( doneArr && doneArr[1] ) {
		this.getDep( doneArr[1], true );
	}
};

Initr.prototype.addDone = function( dep, $els ) {
	var handle = dep.name || dep.handle;
	this.done[ handle ] = [ $els, dep ];
	if ( dep.done ) {
		dep.done( $els, dep );
	}
	this.trigger( handle + ':done', $els, dep );
};

// Helpers
Initr.normalizeEventName = function( eventName ) {
	var parts;
	eventName = $.trim( eventName );

	parts = eventName.split( ':' );

	if ( parts.length === 1 || !parts[1] ) {
		eventName = parts[0] + ':done';
	}
	return eventName;
};

Initr.regHttp = /^https?:\/\//;

var scriptCache = {};

Initr.getScripts = function( scripts, rootPath ) {
	var i, l, script, options, deferred,
		deferreds = [];
	if ( initr.isDev ) {
		console.log( '- Initr:getScripts', scripts );
	}
	if ( !rootPath ) {
		rootPath = '';
	}
	for ( i = 0, l = scripts.length; i < l; i++ ) {
		script = scripts[ i ];
		if ( !Initr.regHttp.test(script) ) {
			script = rootPath + script;
		}
		if ( initr.isDisableScriptCache || !scriptCache[script] ) {
			options = {
				type : 'GET',
				url  : script,
				dataType : 'script',
				cache : true
			};
			if ( initr.timeout ) {
				options.timeout = initr.timeout;
			}
			deferred = $.ajax( options );
			scriptCache[script] = deferred;
		} else {
			if ( initr.isDev ) {
				console.log( '- Initr:scriptCache Found', script );
			}
			deferred = scriptCache[script];
		}
		deferreds.push(
			deferred
		);
	}
	return $.when.apply( null, deferreds );
};

Initr.checkHandle = function( dep, obj, objName ) {
	if ( !(dep && dep.handle) ) {
		if ( initr.isDev ) {
			console.log( '! Initr:error:' + objName + ' - no dependency handle.', dep );
		}
		return false;
	}

	if ( !(obj && obj[ dep.handle ]) ) {
		if ( initr.isDev ) {
			console.log( '! Initr:error:' + objName + ' - handle does not exist on `$.fn`.', dep );
		}
		return false;
	}

	return true;
};

types = {
	'$.fn' : {
		run : function( dep, $els, initrType ) {
			if ( !Initr.checkHandle( dep, $ && $.fn, '$.fn' ) ) {
				return;
			}
			if ( !dep.types ) {
				if ( initr.isDev ) {
					console.log( '- Initr:run:$.fn - no types.', dep.handle, dep, $els );
				}
				$els[ dep.handle ]( dep.defaults );
			} else {

				// Init elements that have a type.
				var typeGroups = initrType.runGroups( dep, $els );

				// If no types were found for the elements,
				// just call the plugin with defaults.
				if ( !typeGroups.length ) {
					if ( initr.isDev ) {
						console.log( '- Initr:run:$.fn - no types found.', dep.handle, dep, $els );
					}
					$els[ dep.handle ]( dep.defaults );
				} else {

					// Run plugin with defaults on all left over elements.
					var $leftOver = initrType.getLeftOvers( $els, typeGroups );

					if ( initr.isDev ) {
						console.log( '- Initr:run:$.fn - left over with no types.', dep.handle, dep, $leftOver );
					}
					$leftOver[ dep.handle ]( dep.defaults );
				}
			}
			this.addDone( dep, $els );
		},
		runGroups : function( dep, $els ) {
			var type, $typeEls, options,
				typeGroups = [];
			for ( var typeName in dep.types ) {
				type = dep.types[ typeName ];

				if ( type.initrTypeBySelector || (dep.defaults && dep.defaults.initrTypeBySelector)  ) {
					// Types by selector.
					$typeEls = $els.filter( typeName );

				} else {

					// Normal types by `data-type`.
					$typeEls = $els.filter( '[data-type="' + typeName + '"]' );
				}

				if ( !$typeEls.length ) {
					continue;
				}

				options = $.extend( {}, dep.defaults, type );

				if ( initr.isDev ) {
					console.log( '- Initr:run:$.fn - type is `' + typeName + '` with options', options, dep.handle, dep, $typeEls );
				}

				$typeEls[ dep.handle ]( options );
				if ( type.initrInit ) {
					type.initrInit( $typeEls, dep );
				}
				typeGroups.push( $typeEls );
			}
			return typeGroups;
		},
		getLeftOvers : function( $els, typeGroups ) {
			var i = 0,
				l = typeGroups.length,
				$typeGroupsFlat = $();
			for ( ; i < l; i++ ) {
				$typeGroupsFlat = $.merge( $typeGroupsFlat, typeGroups[i] );
			}
			return $els.not( $typeGroupsFlat );
		}
	},
	'$' : {
		run : function( dep ) {
			if ( !Initr.checkHandle( dep, window.$, '$' ) ) {
				return;
			}
			if ( initr.isDev ) {
				console.log( '- Initr:run:$ -', dep.handle, dep );
			}
			$[ dep.handle ]( dep.defaults );
			this.addDone( dep, null );
		}
	},
	'app' : {
		run : function( dep, $els ) {
			if ( !Initr.checkHandle( dep, window.app, 'app' ) ) {
				return;
			}
			if ( initr.isDev ) {
				console.log( '- Initr:run:app -', dep.handle, dep );
			}
			var module = app[ dep.handle ];
			if ( module && module.init ) {
				module.init( $els, dep );
			}
			this.addDone( dep, $els );
		}
	}
};

// Make a factory
initr = function( rootPath, deps ) {
	return new Initr( rootPath, deps );
};

initr.Initr = Initr;

initr.scriptCache = scriptCache;

window.initr = initr;

})( jQuery, window );
