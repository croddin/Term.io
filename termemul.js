(function(termemul) {

	termemul.LowLevelTerminal = function() {

		var self = {
			grid: [],
			dirtyLines: {},
			cursor: { x: 0, y: 0, attr: 0x0088 },
			buffer: '',
			cursorId: 'cursor'
		};

		self.attrToClass = function(attr) {
			return 'a' + ('0000' + attr.toString(16)).substr(-4).toUpperCase();
		};

		self.attrFromClass = function(className) {
			if (className) {
				return parseInt(className.substr(1), 16);
			} else {
				return 0x0088;
			}
		};

		self.renderLineAsHtml = function(lineNo) {
			if (lineNo >= self.grid.length) {
				return '';
			}

			var line = self.grid[lineNo];

			var lineLength = line.length;
			if (lineNo === self.cursor.y && self.cursor.x + 1 > lineLength) {
				lineLength = self.cursor.x + 1;
			}

			// TODO: Maybe optimize so we merge multiple spans into one if the attributes are equal. Not so easy though...
			var html = '';
			for (var i = 0; i < lineLength; i++) {
				var ach = line[i] || [self.cursor.attr, ' '];
				var a  = ach[0];
				var ch = ach[1];
				var isCursor = (lineNo === self.cursor.y && i === self.cursor.x);
				if (isCursor) {
					a ^= 0x200;
				}
				var cursor = (isCursor ? ' id="' + self.cursorId + '"' : '');

				html += '<span class="' + self.attrToClass(a) + '"' + cursor + '>' + ch + '</span>';
			}

			return html;
		};

		self.renderEachDirtyLine = function(iterator) {
			for (var lineNo in self.dirtyLines) {
				lineNo = lineNo | 0;
				iterator(lineNo, self.renderLineAsHtml(lineNo));
			}
			self.dirtyLines = {}; // Reset list of dirty lines
		};

		self.ensureLineExists = function(lineNo) {
			while (self.grid.length <= lineNo) {
				self.dirtyLines[self.grid.length] = true;
				self.grid.push([]);
			}
		};

/*
		self.replaceInString = function(string, index, replacement) {
			return string.substr(0, index) + replacement + string.substr(index + replacement.length);
		};
*/
		self.replaceInArray = function(array, index, replacement) {
			return array.slice(0, index).concat(replacement).concat(array.slice(index + replacement.length));
		};

		self.lowLevelReplaceChar = function(position, ach) {
			self.ensureLineExists(position.y);
			self.grid[position.y] = self.replaceInArray(self.grid[position.y], position.x, [ach]);
			self.dirtyLines[position.y] = true;
		};

		self.lowLevelSetCursor = function(newPosition) {
			self.dirtyLines[self.cursor.y] = true;
			if (newPosition.x !== undefined) {
				self.cursor.x = (newPosition.x < 0) ? 0 : newPosition.x;
				// TODO: Check that cursor is not going out of boundaries (x too large).
			}
			if (newPosition.y !== undefined) {
				self.cursor.y = (newPosition.y < 0) ? 0 : newPosition.y;
			}
			self.dirtyLines[self.cursor.y] = true;
			self.ensureLineExists(self.cursor.y);
		};

		self.lowLevelMoveCursor = function(direction) {
			self.lowLevelSetCursor({
				x: self.cursor.x + (direction.x || 0),
				y: self.cursor.y + (direction.y || 0)
			});
		};

		self.enterChar = function(ch) {
			self.lowLevelReplaceChar(self.cursor, [self.cursor.attr, ch]);
			self.lowLevelMoveCursor({ x: 1 });
		};

		self.backSpace = function() {
			self.lowLevelMoveCursor({ x: -1 });
		};

		self.carrigeReturn = function() {
			self.lowLevelSetCursor({ x: 0 });
		};

		self.lineFeed = function() {
			self.lowLevelMoveCursor({ y: 1 });
		};

		self.escapeCodeCSI = function(command, args) {
			if (command === 'm') {
				for (var i = 0; i < args.length; i++) {
					var arg = parseInt(args[i], 10);
					if (arg === 0) {
						self.cursor.attr = 0x0088;
					} else if (arg === 1) {
						self.cursor.attr |= 0x0100;
					} else if (arg === 2) {
						self.cursor.attr &= ~0x0100;
					} else if (arg === 7) {
						self.cursor.attr ^= 0x0200;
					} else if (arg >= 30 && arg <= 37) {
						self.cursor.attr &= ~0x000F;
						self.cursor.attr |= arg - 30;
					} else if (arg === 39) {
						self.cursor.attr &= ~0x000F;
						self.cursor.attr |= 8;
					} else if (arg >= 40 && arg <= 47) {
						self.cursor.attr &= ~0x00F0;
						self.cursor.attr |= (arg - 40) << 4;
					} else if (arg === 49) {
						self.cursor.attr &= ~0x00F0;
						self.cursor.attr |= 8 << 4;
					} else if (window.console && window.JSON) {
						console.log('Unhandled escape code CSI argument for "m": ' + arg);
					}
				}
			} else if (window.console && window.JSON) {
				console.log('Unhandled escape code CSI ' + JSON.stringify(command) + ' ' + JSON.stringify(args));
			}
		};

		self.escapeCodeOSC = function(command) {
			if (command.substr(0, 2) === '0;') {
				document.title = command.substr(2);
			} else if (window.console && window.JSON) {
				console.log('Unhandled escape code OSC ' + JSON.stringify(command));
			}
		};

		self.parseBuffer = function() {
			var currentLength = 0;
			while (currentLength !== self.buffer.length && self.buffer.length > 0) {
				currentLength = self.buffer.length;
				if (self.buffer.substr(0, 1) === '\u001B') {
					var matches;
					if (matches = self.buffer.match(/^\u001B\[([0-9;]*)([A-Za-z])/)) {
						self.buffer = self.buffer.substr(matches[0].length);
						self.escapeCodeCSI(matches[2], matches[1] ? matches[1].split(';') : []);
					} else if (matches = self.buffer.match(/^\u001B\](.*)(?:\u0007|\u001B\\)/)) {
						self.buffer = self.buffer.substr(matches[0].length);
						self.escapeCodeOSC(matches[1]);
					} else if (window.console && window.JSON) {
						console.log('Unhandled escape codes ' + JSON.stringify(self.buffer));
					}
				} else {
					var ch = self.buffer.substr(0, 1);
					self.buffer = self.buffer.substr(1);
					if (ch === '\b') {
						self.backSpace();
					} else if (ch === '\r') {
						self.carrigeReturn();
					} else if (ch === '\n') {
						self.lineFeed();
					} else if (ch >= ' ') {
						self.enterChar(ch);
					} else if (window.console && window.JSON) {
						console.log('Unhandled character ' + JSON.stringify(ch));
					}
				}
			}
			if (self.buffer.length > 0 && window.console && window.JSON) {
				console.log('Unparsed buffer ' + JSON.stringify(self.buffer));
			}
		};

		self.write = function(data) {
			self.buffer += data;
			self.parseBuffer();
		};

		self.attributeToCss = function(colors, attr) {
			var bright  = attr & 0x100;
			var inverse = attr & 0x200;
			var bgIndex = (attr >> 4) & 0xF;
			var fgIndex =  attr       & 0xF;
			if (bgIndex >= 8) { bgIndex = 16; }
			if (fgIndex >= 8) { fgIndex = 17; }
			if (inverse) {
				var swap = bgIndex;
				bgIndex  = fgIndex;
				fgIndex  = swap;
			}
			if (fgIndex < 8 && bright) { fgIndex |= 8; }
			return 'background: ' + colors[bgIndex] + '; color: ' + colors[fgIndex] + ';' +
				(bright ? ' font-weight: bold;' : '');
		};

		self.compileAttributesAsCss = function(colors) {
			var css = '\r\n';
			for (var misc = 0; misc <= 3; misc++) {
				for (var bg = 0; bg <= 8; bg++) {
					for (var fg = 0; fg <= 8; fg++) {
						var attr = misc << 8 | bg << 4 | fg;
						var classSel = '.' + self.attrToClass(attr);
						css += classSel + ' { ' + self.attributeToCss(colors, attr) + ' }\r\n';
						css += classSel + '::selection { ' + self.attributeToCss(colors, (attr ^ 0x200) & ~0x100) + ' }\r\n';
					}
				}
			}
			return css;
		};

		return self;
	};


	termemul.JQueryTerminal = function(element, inputElement) {
		inputElement = inputElement || window;

		var noop = function() {};
		//var $window = $(window);

		var self = {
			term: termemul.LowLevelTerminal(),
			terminalElement: $(element),
			terminalInputElement: $(inputElement),
			oninput: null,
			cursorBlinkId: undefined,
			cursorBlinkSpeed: 500,
			_colors: null,
			stylesheetId: 'terminal-css'
		};

		self.terminalElement.html('<div class="a0088"></div>')
		self.terminalInputElement.keydown(function(e) {
			//console.log('keydown... ' + e.keyCode);
			if (e.keyCode === 8 || e.keyCode === 27) {
				var ch = String.fromCharCode(e.keyCode);
				(self.oninput || noop)(ch);
				e.preventDefault();
				return false;
			} else if (window.console) {
				//console.log('Unhandled keydown ' + e.keyCode);
			}
		});
		self.terminalInputElement.keypress(function(e) {
			//console.log('keypress... ' + e.keyCode);
			var ch = String.fromCharCode(e.keyCode);
			if (ch === '\r' || ch >= ' ') {
				(self.oninput || noop)(ch);
			} else if (window.console && window.JSON) {
				console.log('Unhandled keypress ' + JSON.stringify(ch));
			}
			e.preventDefault();
			return false;
		});
		self.terminalInputElement.keyup(function(e) {
			//console.log('keyup... ' + e.keyCode);
		});

		self.applyTerminalCss = function(css) {
			if (!document.getElementById(self.stylesheetId)) {
				$('<style type="text/css" id="' + self.stylesheetId + '">' + css + '</style>').appendTo($('head'));
			} else {
				$('#' + self.stylesheetId).html(css);
			}
		};

		self.theme = function(newColors) {
			if (newColors === undefined) {
				return self._colors.slice(0);
			} else {
				self._colors = newColors.slice(0);
				self.applyTerminalCss(self.term.compileAttributesAsCss(self._colors));
			}
		};

		self.themes = {
			'Tango': [
				'#000000', '#cc0000', '#4e9a06', '#c4a000', '#3465a4', '#75507b', '#06989a', '#d3d7cf',
				'#555753', '#ef2929', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
				'#ffffff', '#1a1a1a' ],
			'Linux Terminal': [
				'#000', '#a00', '#0a0', '#a50', '#00a', '#a0a', '#0aa', '#aaa',
				'#555', '#f55', '#5f5', '#ff5', '#55f', '#f5f', '#5ff', '#fff',
				'#000', '#fff' ]
		};
		self.theme(self.themes['Linux Terminal']);

/*
		function enableScrollSnapping() {
			function snap() {
				var lines  = $terminal.find(':parent').size() || 1;
				var height = $terminal.height();
				var characterHeight = (height / lines) || 1;
				var position = $window.scrollTop();
				var snapPosition = Math.floor(Math.floor(position / characterHeight) * characterHeight);
				if (position !== snapPosition) {
					$window.scrollTop(snapPosition);
				}
				return false;
			}
			$window.scroll(snap);
			$window.resize(snap);
			setTimeout(snap, 0);
		};
		enableScrollSnapping();
*/

		self.startCursorBlinking = function() {
			self.stopCursorBlinking();
			self.cursorBlinkId = window.setInterval(function() {
				var cursor = $('#' + self.term.cursorId);
				var attr = self.term.attrFromClass(cursor.attr('class'));
				attr ^= 0x200;
				cursor.attr('class', self.term.attrToClass(attr));
			}, self.cursorBlinkSpeed);
		};

		self.stopCursorBlinking = function() {
			if (self.cursorBlinkId !== undefined) {
				window.clearInterval(self.cursorBlinkId);
			}
			self.cursorBlinkId = undefined;
		};

		self.numberOfLines = function() {
			return self.terminalElement.find('> :parent').size() || 1
		};

		self.ensureLineExists = function(lineNo) {
			var missingLines = lineNo - self.numberOfLines() + 1;
			if (missingLines > 0) {
				var html = '';
				for (var i = 0; i < missingLines; i++) {
					html += '<div class="a0088"></div>';
				}
				self.terminalElement.append(html);
			}
		};

		self.write = function(data) {
			self.term.write(data);
			self.term.renderEachDirtyLine(function(lineNo, html) {
				self.ensureLineExists(lineNo);
				self.terminalElement.find('> :eq(' + lineNo + ')').html(html);
			});
			self.startCursorBlinking();
		};

		return self;
	};

})(window.termemul = {});