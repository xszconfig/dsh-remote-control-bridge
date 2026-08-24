window.__ModuleLoader__.load({
	id: "dsh-remote-control-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/.pnpm/qrcode-generator@1.5.2/node_modules/qrcode-generator/qrcode.js
var require_qrcode = __commonJS({
  "node_modules/.pnpm/qrcode-generator@1.5.2/node_modules/qrcode-generator/qrcode.js"(exports, module2) {
    var qrcode2 = function() {
      var qrcode3 = function(typeNumber, errorCorrectionLevel) {
        var PAD0 = 236;
        var PAD1 = 17;
        var _typeNumber = typeNumber;
        var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
        var _modules = null;
        var _moduleCount = 0;
        var _dataCache = null;
        var _dataList = [];
        var _this = {};
        var makeImpl = function(test, maskPattern) {
          _moduleCount = _typeNumber * 4 + 17;
          _modules = function(moduleCount) {
            var modules = new Array(moduleCount);
            for (var row = 0; row < moduleCount; row += 1) {
              modules[row] = new Array(moduleCount);
              for (var col = 0; col < moduleCount; col += 1) {
                modules[row][col] = null;
              }
            }
            return modules;
          }(_moduleCount);
          setupPositionProbePattern(0, 0);
          setupPositionProbePattern(_moduleCount - 7, 0);
          setupPositionProbePattern(0, _moduleCount - 7);
          setupPositionAdjustPattern();
          setupTimingPattern();
          setupTypeInfo(test, maskPattern);
          if (_typeNumber >= 7) {
            setupTypeNumber(test);
          }
          if (_dataCache == null) {
            _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
          }
          mapData(_dataCache, maskPattern);
        };
        var setupPositionProbePattern = function(row, col) {
          for (var r = -1; r <= 7; r += 1) {
            if (row + r <= -1 || _moduleCount <= row + r) continue;
            for (var c = -1; c <= 7; c += 1) {
              if (col + c <= -1 || _moduleCount <= col + c) continue;
              if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        };
        var getBestMaskPattern = function() {
          var minLostPoint = 0;
          var pattern = 0;
          for (var i = 0; i < 8; i += 1) {
            makeImpl(true, i);
            var lostPoint = QRUtil.getLostPoint(_this);
            if (i == 0 || minLostPoint > lostPoint) {
              minLostPoint = lostPoint;
              pattern = i;
            }
          }
          return pattern;
        };
        var setupTimingPattern = function() {
          for (var r = 8; r < _moduleCount - 8; r += 1) {
            if (_modules[r][6] != null) {
              continue;
            }
            _modules[r][6] = r % 2 == 0;
          }
          for (var c = 8; c < _moduleCount - 8; c += 1) {
            if (_modules[6][c] != null) {
              continue;
            }
            _modules[6][c] = c % 2 == 0;
          }
        };
        var setupPositionAdjustPattern = function() {
          var pos = QRUtil.getPatternPosition(_typeNumber);
          for (var i = 0; i < pos.length; i += 1) {
            for (var j = 0; j < pos.length; j += 1) {
              var row = pos[i];
              var col = pos[j];
              if (_modules[row][col] != null) {
                continue;
              }
              for (var r = -2; r <= 2; r += 1) {
                for (var c = -2; c <= 2; c += 1) {
                  if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) {
                    _modules[row + r][col + c] = true;
                  } else {
                    _modules[row + r][col + c] = false;
                  }
                }
              }
            }
          }
        };
        var setupTypeNumber = function(test) {
          var bits = QRUtil.getBCHTypeNumber(_typeNumber);
          for (var i = 0; i < 18; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
          }
          for (var i = 0; i < 18; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
          }
        };
        var setupTypeInfo = function(test, maskPattern) {
          var data = _errorCorrectionLevel << 3 | maskPattern;
          var bits = QRUtil.getBCHTypeInfo(data);
          for (var i = 0; i < 15; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            if (i < 6) {
              _modules[i][8] = mod;
            } else if (i < 8) {
              _modules[i + 1][8] = mod;
            } else {
              _modules[_moduleCount - 15 + i][8] = mod;
            }
          }
          for (var i = 0; i < 15; i += 1) {
            var mod = !test && (bits >> i & 1) == 1;
            if (i < 8) {
              _modules[8][_moduleCount - i - 1] = mod;
            } else if (i < 9) {
              _modules[8][15 - i - 1 + 1] = mod;
            } else {
              _modules[8][15 - i - 1] = mod;
            }
          }
          _modules[_moduleCount - 8][8] = !test;
        };
        var mapData = function(data, maskPattern) {
          var inc = -1;
          var row = _moduleCount - 1;
          var bitIndex = 7;
          var byteIndex = 0;
          var maskFunc = QRUtil.getMaskFunction(maskPattern);
          for (var col = _moduleCount - 1; col > 0; col -= 2) {
            if (col == 6) col -= 1;
            while (true) {
              for (var c = 0; c < 2; c += 1) {
                if (_modules[row][col - c] == null) {
                  var dark = false;
                  if (byteIndex < data.length) {
                    dark = (data[byteIndex] >>> bitIndex & 1) == 1;
                  }
                  var mask = maskFunc(row, col - c);
                  if (mask) {
                    dark = !dark;
                  }
                  _modules[row][col - c] = dark;
                  bitIndex -= 1;
                  if (bitIndex == -1) {
                    byteIndex += 1;
                    bitIndex = 7;
                  }
                }
              }
              row += inc;
              if (row < 0 || _moduleCount <= row) {
                row -= inc;
                inc = -inc;
                break;
              }
            }
          }
        };
        var createBytes = function(buffer, rsBlocks) {
          var offset = 0;
          var maxDcCount = 0;
          var maxEcCount = 0;
          var dcdata = new Array(rsBlocks.length);
          var ecdata = new Array(rsBlocks.length);
          for (var r = 0; r < rsBlocks.length; r += 1) {
            var dcCount = rsBlocks[r].dataCount;
            var ecCount = rsBlocks[r].totalCount - dcCount;
            maxDcCount = Math.max(maxDcCount, dcCount);
            maxEcCount = Math.max(maxEcCount, ecCount);
            dcdata[r] = new Array(dcCount);
            for (var i = 0; i < dcdata[r].length; i += 1) {
              dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
            }
            offset += dcCount;
            var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
            var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
            var modPoly = rawPoly.mod(rsPoly);
            ecdata[r] = new Array(rsPoly.getLength() - 1);
            for (var i = 0; i < ecdata[r].length; i += 1) {
              var modIndex = i + modPoly.getLength() - ecdata[r].length;
              ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
            }
          }
          var totalCodeCount = 0;
          for (var i = 0; i < rsBlocks.length; i += 1) {
            totalCodeCount += rsBlocks[i].totalCount;
          }
          var data = new Array(totalCodeCount);
          var index = 0;
          for (var i = 0; i < maxDcCount; i += 1) {
            for (var r = 0; r < rsBlocks.length; r += 1) {
              if (i < dcdata[r].length) {
                data[index] = dcdata[r][i];
                index += 1;
              }
            }
          }
          for (var i = 0; i < maxEcCount; i += 1) {
            for (var r = 0; r < rsBlocks.length; r += 1) {
              if (i < ecdata[r].length) {
                data[index] = ecdata[r][i];
                index += 1;
              }
            }
          }
          return data;
        };
        var createData = function(typeNumber2, errorCorrectionLevel2, dataList) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, errorCorrectionLevel2);
          var buffer = qrBitBuffer();
          for (var i = 0; i < dataList.length; i += 1) {
            var data = dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
            data.write(buffer);
          }
          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i += 1) {
            totalDataCount += rsBlocks[i].dataCount;
          }
          if (buffer.getLengthInBits() > totalDataCount * 8) {
            throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
          }
          if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
            buffer.put(0, 4);
          }
          while (buffer.getLengthInBits() % 8 != 0) {
            buffer.putBit(false);
          }
          while (true) {
            if (buffer.getLengthInBits() >= totalDataCount * 8) {
              break;
            }
            buffer.put(PAD0, 8);
            if (buffer.getLengthInBits() >= totalDataCount * 8) {
              break;
            }
            buffer.put(PAD1, 8);
          }
          return createBytes(buffer, rsBlocks);
        };
        _this.addData = function(data, mode) {
          mode = mode || "Byte";
          var newData = null;
          switch (mode) {
            case "Numeric":
              newData = qrNumber(data);
              break;
            case "Alphanumeric":
              newData = qrAlphaNum(data);
              break;
            case "Byte":
              newData = qr8BitByte(data);
              break;
            case "Kanji":
              newData = qrKanji(data);
              break;
            default:
              throw "mode:" + mode;
          }
          _dataList.push(newData);
          _dataCache = null;
        };
        _this.isDark = function(row, col) {
          if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
            throw row + "," + col;
          }
          return _modules[row][col];
        };
        _this.getModuleCount = function() {
          return _moduleCount;
        };
        _this.make = function() {
          if (_typeNumber < 1) {
            var typeNumber2 = 1;
            for (; typeNumber2 < 40; typeNumber2++) {
              var rsBlocks = QRRSBlock.getRSBlocks(typeNumber2, _errorCorrectionLevel);
              var buffer = qrBitBuffer();
              for (var i = 0; i < _dataList.length; i++) {
                var data = _dataList[i];
                buffer.put(data.getMode(), 4);
                buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber2));
                data.write(buffer);
              }
              var totalDataCount = 0;
              for (var i = 0; i < rsBlocks.length; i++) {
                totalDataCount += rsBlocks[i].dataCount;
              }
              if (buffer.getLengthInBits() <= totalDataCount * 8) {
                break;
              }
            }
            _typeNumber = typeNumber2;
          }
          makeImpl(false, getBestMaskPattern());
        };
        _this.createTableTag = function(cellSize, margin) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var qrHtml = "";
          qrHtml += '<table style="';
          qrHtml += " border-width: 0px; border-style: none;";
          qrHtml += " border-collapse: collapse;";
          qrHtml += " padding: 0px; margin: " + margin + "px;";
          qrHtml += '">';
          qrHtml += "<tbody>";
          for (var r = 0; r < _this.getModuleCount(); r += 1) {
            qrHtml += "<tr>";
            for (var c = 0; c < _this.getModuleCount(); c += 1) {
              qrHtml += '<td style="';
              qrHtml += " border-width: 0px; border-style: none;";
              qrHtml += " border-collapse: collapse;";
              qrHtml += " padding: 0px; margin: 0px;";
              qrHtml += " width: " + cellSize + "px;";
              qrHtml += " height: " + cellSize + "px;";
              qrHtml += " background-color: ";
              qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
              qrHtml += ";";
              qrHtml += '"/>';
            }
            qrHtml += "</tr>";
          }
          qrHtml += "</tbody>";
          qrHtml += "</table>";
          return qrHtml;
        };
        _this.createSvgTag = function(cellSize, margin, alt, title) {
          var opts = {};
          if (typeof arguments[0] == "object") {
            opts = arguments[0];
            cellSize = opts.cellSize;
            margin = opts.margin;
            alt = opts.alt;
            title = opts.title;
          }
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          alt = typeof alt === "string" ? { text: alt } : alt || {};
          alt.text = alt.text || null;
          alt.id = alt.text ? alt.id || "qrcode-description" : null;
          title = typeof title === "string" ? { text: title } : title || {};
          title.text = title.text || null;
          title.id = title.text ? title.id || "qrcode-title" : null;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var c, mc, r, mr, qrSvg = "", rect;
          rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
          qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
          qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : "";
          qrSvg += ' viewBox="0 0 ' + size + " " + size + '" ';
          qrSvg += ' preserveAspectRatio="xMinYMin meet"';
          qrSvg += title.text || alt.text ? ' role="img" aria-labelledby="' + escapeXml([title.id, alt.id].join(" ").trim()) + '"' : "";
          qrSvg += ">";
          qrSvg += title.text ? '<title id="' + escapeXml(title.id) + '">' + escapeXml(title.text) + "</title>" : "";
          qrSvg += alt.text ? '<description id="' + escapeXml(alt.id) + '">' + escapeXml(alt.text) + "</description>" : "";
          qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
          qrSvg += '<path d="';
          for (r = 0; r < _this.getModuleCount(); r += 1) {
            mr = r * cellSize + margin;
            for (c = 0; c < _this.getModuleCount(); c += 1) {
              if (_this.isDark(r, c)) {
                mc = c * cellSize + margin;
                qrSvg += "M" + mc + "," + mr + rect;
              }
            }
          }
          qrSvg += '" stroke="transparent" fill="black"/>';
          qrSvg += "</svg>";
          return qrSvg;
        };
        _this.createDataURL = function(cellSize, margin) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          return createDataURL(size, size, function(x, y) {
            if (min <= x && x < max && min <= y && y < max) {
              var c = Math.floor((x - min) / cellSize);
              var r = Math.floor((y - min) / cellSize);
              return _this.isDark(r, c) ? 0 : 1;
            } else {
              return 1;
            }
          });
        };
        _this.createImgTag = function(cellSize, margin, alt) {
          cellSize = cellSize || 2;
          margin = typeof margin == "undefined" ? cellSize * 4 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var img = "";
          img += "<img";
          img += ' src="';
          img += _this.createDataURL(cellSize, margin);
          img += '"';
          img += ' width="';
          img += size;
          img += '"';
          img += ' height="';
          img += size;
          img += '"';
          if (alt) {
            img += ' alt="';
            img += escapeXml(alt);
            img += '"';
          }
          img += "/>";
          return img;
        };
        var escapeXml = function(s) {
          var escaped = "";
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charAt(i);
            switch (c) {
              case "<":
                escaped += "&lt;";
                break;
              case ">":
                escaped += "&gt;";
                break;
              case "&":
                escaped += "&amp;";
                break;
              case '"':
                escaped += "&quot;";
                break;
              default:
                escaped += c;
                break;
            }
          }
          return escaped;
        };
        var _createHalfASCII = function(margin) {
          var cellSize = 1;
          margin = typeof margin == "undefined" ? cellSize * 2 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          var y, x, r1, r2, p;
          var blocks = {
            "\u2588\u2588": "\u2588",
            "\u2588 ": "\u2580",
            " \u2588": "\u2584",
            "  ": " "
          };
          var blocksLastLineNoMargin = {
            "\u2588\u2588": "\u2580",
            "\u2588 ": "\u2580",
            " \u2588": " ",
            "  ": " "
          };
          var ascii = "";
          for (y = 0; y < size; y += 2) {
            r1 = Math.floor((y - min) / cellSize);
            r2 = Math.floor((y + 1 - min) / cellSize);
            for (x = 0; x < size; x += 1) {
              p = "\u2588";
              if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
                p = " ";
              }
              if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
                p += " ";
              } else {
                p += "\u2588";
              }
              ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
            }
            ascii += "\n";
          }
          if (size % 2 && margin > 0) {
            return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("\u2580");
          }
          return ascii.substring(0, ascii.length - 1);
        };
        _this.createASCII = function(cellSize, margin) {
          cellSize = cellSize || 1;
          if (cellSize < 2) {
            return _createHalfASCII(margin);
          }
          cellSize -= 1;
          margin = typeof margin == "undefined" ? cellSize * 2 : margin;
          var size = _this.getModuleCount() * cellSize + margin * 2;
          var min = margin;
          var max = size - margin;
          var y, x, r, p;
          var white = Array(cellSize + 1).join("\u2588\u2588");
          var black = Array(cellSize + 1).join("  ");
          var ascii = "";
          var line = "";
          for (y = 0; y < size; y += 1) {
            r = Math.floor((y - min) / cellSize);
            line = "";
            for (x = 0; x < size; x += 1) {
              p = 1;
              if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
                p = 0;
              }
              line += p ? white : black;
            }
            for (r = 0; r < cellSize; r += 1) {
              ascii += line + "\n";
            }
          }
          return ascii.substring(0, ascii.length - 1);
        };
        _this.renderTo2dContext = function(context, cellSize) {
          cellSize = cellSize || 2;
          var length = _this.getModuleCount();
          for (var row = 0; row < length; row++) {
            for (var col = 0; col < length; col++) {
              context.fillStyle = _this.isDark(row, col) ? "black" : "white";
              context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
            }
          }
        };
        return _this;
      };
      qrcode3.stringToBytesFuncs = {
        "default": function(s) {
          var bytes = [];
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            bytes.push(c & 255);
          }
          return bytes;
        }
      };
      qrcode3.stringToBytes = qrcode3.stringToBytesFuncs["default"];
      qrcode3.createStringToBytes = function(unicodeData, numChars) {
        var unicodeMap = function() {
          var bin = base64DecodeInputStream(unicodeData);
          var read = function() {
            var b = bin.read();
            if (b == -1) throw "eof";
            return b;
          };
          var count = 0;
          var unicodeMap2 = {};
          while (true) {
            var b0 = bin.read();
            if (b0 == -1) break;
            var b1 = read();
            var b2 = read();
            var b3 = read();
            var k = String.fromCharCode(b0 << 8 | b1);
            var v = b2 << 8 | b3;
            unicodeMap2[k] = v;
            count += 1;
          }
          if (count != numChars) {
            throw count + " != " + numChars;
          }
          return unicodeMap2;
        }();
        var unknownChar = "?".charCodeAt(0);
        return function(s) {
          var bytes = [];
          for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            if (c < 128) {
              bytes.push(c);
            } else {
              var b = unicodeMap[s.charAt(i)];
              if (typeof b == "number") {
                if ((b & 255) == b) {
                  bytes.push(b);
                } else {
                  bytes.push(b >>> 8);
                  bytes.push(b & 255);
                }
              } else {
                bytes.push(unknownChar);
              }
            }
          }
          return bytes;
        };
      };
      var QRMode = {
        MODE_NUMBER: 1 << 0,
        MODE_ALPHA_NUM: 1 << 1,
        MODE_8BIT_BYTE: 1 << 2,
        MODE_KANJI: 1 << 3
      };
      var QRErrorCorrectionLevel = {
        L: 1,
        M: 0,
        Q: 3,
        H: 2
      };
      var QRMaskPattern = {
        PATTERN000: 0,
        PATTERN001: 1,
        PATTERN010: 2,
        PATTERN011: 3,
        PATTERN100: 4,
        PATTERN101: 5,
        PATTERN110: 6,
        PATTERN111: 7
      };
      var QRUtil = function() {
        var PATTERN_POSITION_TABLE = [
          [],
          [6, 18],
          [6, 22],
          [6, 26],
          [6, 30],
          [6, 34],
          [6, 22, 38],
          [6, 24, 42],
          [6, 26, 46],
          [6, 28, 50],
          [6, 30, 54],
          [6, 32, 58],
          [6, 34, 62],
          [6, 26, 46, 66],
          [6, 26, 48, 70],
          [6, 26, 50, 74],
          [6, 30, 54, 78],
          [6, 30, 56, 82],
          [6, 30, 58, 86],
          [6, 34, 62, 90],
          [6, 28, 50, 72, 94],
          [6, 26, 50, 74, 98],
          [6, 30, 54, 78, 102],
          [6, 28, 54, 80, 106],
          [6, 32, 58, 84, 110],
          [6, 30, 58, 86, 114],
          [6, 34, 62, 90, 118],
          [6, 26, 50, 74, 98, 122],
          [6, 30, 54, 78, 102, 126],
          [6, 26, 52, 78, 104, 130],
          [6, 30, 56, 82, 108, 134],
          [6, 34, 60, 86, 112, 138],
          [6, 30, 58, 86, 114, 142],
          [6, 34, 62, 90, 118, 146],
          [6, 30, 54, 78, 102, 126, 150],
          [6, 24, 50, 76, 102, 128, 154],
          [6, 28, 54, 80, 106, 132, 158],
          [6, 32, 58, 84, 110, 136, 162],
          [6, 26, 54, 82, 110, 138, 166],
          [6, 30, 58, 86, 114, 142, 170]
        ];
        var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
        var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
        var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
        var _this = {};
        var getBCHDigit = function(data) {
          var digit = 0;
          while (data != 0) {
            digit += 1;
            data >>>= 1;
          }
          return digit;
        };
        _this.getBCHTypeInfo = function(data) {
          var d = data << 10;
          while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
            d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
          }
          return (data << 10 | d) ^ G15_MASK;
        };
        _this.getBCHTypeNumber = function(data) {
          var d = data << 12;
          while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
            d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
          }
          return data << 12 | d;
        };
        _this.getPatternPosition = function(typeNumber) {
          return PATTERN_POSITION_TABLE[typeNumber - 1];
        };
        _this.getMaskFunction = function(maskPattern) {
          switch (maskPattern) {
            case QRMaskPattern.PATTERN000:
              return function(i, j) {
                return (i + j) % 2 == 0;
              };
            case QRMaskPattern.PATTERN001:
              return function(i, j) {
                return i % 2 == 0;
              };
            case QRMaskPattern.PATTERN010:
              return function(i, j) {
                return j % 3 == 0;
              };
            case QRMaskPattern.PATTERN011:
              return function(i, j) {
                return (i + j) % 3 == 0;
              };
            case QRMaskPattern.PATTERN100:
              return function(i, j) {
                return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
              };
            case QRMaskPattern.PATTERN101:
              return function(i, j) {
                return i * j % 2 + i * j % 3 == 0;
              };
            case QRMaskPattern.PATTERN110:
              return function(i, j) {
                return (i * j % 2 + i * j % 3) % 2 == 0;
              };
            case QRMaskPattern.PATTERN111:
              return function(i, j) {
                return (i * j % 3 + (i + j) % 2) % 2 == 0;
              };
            default:
              throw "bad maskPattern:" + maskPattern;
          }
        };
        _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
          var a = qrPolynomial([1], 0);
          for (var i = 0; i < errorCorrectLength; i += 1) {
            a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
          }
          return a;
        };
        _this.getLengthInBits = function(mode, type) {
          if (1 <= type && type < 10) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 10;
              case QRMode.MODE_ALPHA_NUM:
                return 9;
              case QRMode.MODE_8BIT_BYTE:
                return 8;
              case QRMode.MODE_KANJI:
                return 8;
              default:
                throw "mode:" + mode;
            }
          } else if (type < 27) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 12;
              case QRMode.MODE_ALPHA_NUM:
                return 11;
              case QRMode.MODE_8BIT_BYTE:
                return 16;
              case QRMode.MODE_KANJI:
                return 10;
              default:
                throw "mode:" + mode;
            }
          } else if (type < 41) {
            switch (mode) {
              case QRMode.MODE_NUMBER:
                return 14;
              case QRMode.MODE_ALPHA_NUM:
                return 13;
              case QRMode.MODE_8BIT_BYTE:
                return 16;
              case QRMode.MODE_KANJI:
                return 12;
              default:
                throw "mode:" + mode;
            }
          } else {
            throw "type:" + type;
          }
        };
        _this.getLostPoint = function(qrcode4) {
          var moduleCount = qrcode4.getModuleCount();
          var lostPoint = 0;
          for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount; col += 1) {
              var sameCount = 0;
              var dark = qrcode4.isDark(row, col);
              for (var r = -1; r <= 1; r += 1) {
                if (row + r < 0 || moduleCount <= row + r) {
                  continue;
                }
                for (var c = -1; c <= 1; c += 1) {
                  if (col + c < 0 || moduleCount <= col + c) {
                    continue;
                  }
                  if (r == 0 && c == 0) {
                    continue;
                  }
                  if (dark == qrcode4.isDark(row + r, col + c)) {
                    sameCount += 1;
                  }
                }
              }
              if (sameCount > 5) {
                lostPoint += 3 + sameCount - 5;
              }
            }
          }
          ;
          for (var row = 0; row < moduleCount - 1; row += 1) {
            for (var col = 0; col < moduleCount - 1; col += 1) {
              var count = 0;
              if (qrcode4.isDark(row, col)) count += 1;
              if (qrcode4.isDark(row + 1, col)) count += 1;
              if (qrcode4.isDark(row, col + 1)) count += 1;
              if (qrcode4.isDark(row + 1, col + 1)) count += 1;
              if (count == 0 || count == 4) {
                lostPoint += 3;
              }
            }
          }
          for (var row = 0; row < moduleCount; row += 1) {
            for (var col = 0; col < moduleCount - 6; col += 1) {
              if (qrcode4.isDark(row, col) && !qrcode4.isDark(row, col + 1) && qrcode4.isDark(row, col + 2) && qrcode4.isDark(row, col + 3) && qrcode4.isDark(row, col + 4) && !qrcode4.isDark(row, col + 5) && qrcode4.isDark(row, col + 6)) {
                lostPoint += 40;
              }
            }
          }
          for (var col = 0; col < moduleCount; col += 1) {
            for (var row = 0; row < moduleCount - 6; row += 1) {
              if (qrcode4.isDark(row, col) && !qrcode4.isDark(row + 1, col) && qrcode4.isDark(row + 2, col) && qrcode4.isDark(row + 3, col) && qrcode4.isDark(row + 4, col) && !qrcode4.isDark(row + 5, col) && qrcode4.isDark(row + 6, col)) {
                lostPoint += 40;
              }
            }
          }
          var darkCount = 0;
          for (var col = 0; col < moduleCount; col += 1) {
            for (var row = 0; row < moduleCount; row += 1) {
              if (qrcode4.isDark(row, col)) {
                darkCount += 1;
              }
            }
          }
          var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
          lostPoint += ratio * 10;
          return lostPoint;
        };
        return _this;
      }();
      var QRMath = function() {
        var EXP_TABLE = new Array(256);
        var LOG_TABLE = new Array(256);
        for (var i = 0; i < 8; i += 1) {
          EXP_TABLE[i] = 1 << i;
        }
        for (var i = 8; i < 256; i += 1) {
          EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
        }
        for (var i = 0; i < 255; i += 1) {
          LOG_TABLE[EXP_TABLE[i]] = i;
        }
        var _this = {};
        _this.glog = function(n) {
          if (n < 1) {
            throw "glog(" + n + ")";
          }
          return LOG_TABLE[n];
        };
        _this.gexp = function(n) {
          while (n < 0) {
            n += 255;
          }
          while (n >= 256) {
            n -= 255;
          }
          return EXP_TABLE[n];
        };
        return _this;
      }();
      function qrPolynomial(num, shift) {
        if (typeof num.length == "undefined") {
          throw num.length + "/" + shift;
        }
        var _num = function() {
          var offset = 0;
          while (offset < num.length && num[offset] == 0) {
            offset += 1;
          }
          var _num2 = new Array(num.length - offset + shift);
          for (var i = 0; i < num.length - offset; i += 1) {
            _num2[i] = num[i + offset];
          }
          return _num2;
        }();
        var _this = {};
        _this.getAt = function(index) {
          return _num[index];
        };
        _this.getLength = function() {
          return _num.length;
        };
        _this.multiply = function(e) {
          var num2 = new Array(_this.getLength() + e.getLength() - 1);
          for (var i = 0; i < _this.getLength(); i += 1) {
            for (var j = 0; j < e.getLength(); j += 1) {
              num2[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
            }
          }
          return qrPolynomial(num2, 0);
        };
        _this.mod = function(e) {
          if (_this.getLength() - e.getLength() < 0) {
            return _this;
          }
          var ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
          var num2 = new Array(_this.getLength());
          for (var i = 0; i < _this.getLength(); i += 1) {
            num2[i] = _this.getAt(i);
          }
          for (var i = 0; i < e.getLength(); i += 1) {
            num2[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
          }
          return qrPolynomial(num2, 0).mod(e);
        };
        return _this;
      }
      ;
      var QRRSBlock = function() {
        var RS_BLOCK_TABLE = [
          // L
          // M
          // Q
          // H
          // 1
          [1, 26, 19],
          [1, 26, 16],
          [1, 26, 13],
          [1, 26, 9],
          // 2
          [1, 44, 34],
          [1, 44, 28],
          [1, 44, 22],
          [1, 44, 16],
          // 3
          [1, 70, 55],
          [1, 70, 44],
          [2, 35, 17],
          [2, 35, 13],
          // 4
          [1, 100, 80],
          [2, 50, 32],
          [2, 50, 24],
          [4, 25, 9],
          // 5
          [1, 134, 108],
          [2, 67, 43],
          [2, 33, 15, 2, 34, 16],
          [2, 33, 11, 2, 34, 12],
          // 6
          [2, 86, 68],
          [4, 43, 27],
          [4, 43, 19],
          [4, 43, 15],
          // 7
          [2, 98, 78],
          [4, 49, 31],
          [2, 32, 14, 4, 33, 15],
          [4, 39, 13, 1, 40, 14],
          // 8
          [2, 121, 97],
          [2, 60, 38, 2, 61, 39],
          [4, 40, 18, 2, 41, 19],
          [4, 40, 14, 2, 41, 15],
          // 9
          [2, 146, 116],
          [3, 58, 36, 2, 59, 37],
          [4, 36, 16, 4, 37, 17],
          [4, 36, 12, 4, 37, 13],
          // 10
          [2, 86, 68, 2, 87, 69],
          [4, 69, 43, 1, 70, 44],
          [6, 43, 19, 2, 44, 20],
          [6, 43, 15, 2, 44, 16],
          // 11
          [4, 101, 81],
          [1, 80, 50, 4, 81, 51],
          [4, 50, 22, 4, 51, 23],
          [3, 36, 12, 8, 37, 13],
          // 12
          [2, 116, 92, 2, 117, 93],
          [6, 58, 36, 2, 59, 37],
          [4, 46, 20, 6, 47, 21],
          [7, 42, 14, 4, 43, 15],
          // 13
          [4, 133, 107],
          [8, 59, 37, 1, 60, 38],
          [8, 44, 20, 4, 45, 21],
          [12, 33, 11, 4, 34, 12],
          // 14
          [3, 145, 115, 1, 146, 116],
          [4, 64, 40, 5, 65, 41],
          [11, 36, 16, 5, 37, 17],
          [11, 36, 12, 5, 37, 13],
          // 15
          [5, 109, 87, 1, 110, 88],
          [5, 65, 41, 5, 66, 42],
          [5, 54, 24, 7, 55, 25],
          [11, 36, 12, 7, 37, 13],
          // 16
          [5, 122, 98, 1, 123, 99],
          [7, 73, 45, 3, 74, 46],
          [15, 43, 19, 2, 44, 20],
          [3, 45, 15, 13, 46, 16],
          // 17
          [1, 135, 107, 5, 136, 108],
          [10, 74, 46, 1, 75, 47],
          [1, 50, 22, 15, 51, 23],
          [2, 42, 14, 17, 43, 15],
          // 18
          [5, 150, 120, 1, 151, 121],
          [9, 69, 43, 4, 70, 44],
          [17, 50, 22, 1, 51, 23],
          [2, 42, 14, 19, 43, 15],
          // 19
          [3, 141, 113, 4, 142, 114],
          [3, 70, 44, 11, 71, 45],
          [17, 47, 21, 4, 48, 22],
          [9, 39, 13, 16, 40, 14],
          // 20
          [3, 135, 107, 5, 136, 108],
          [3, 67, 41, 13, 68, 42],
          [15, 54, 24, 5, 55, 25],
          [15, 43, 15, 10, 44, 16],
          // 21
          [4, 144, 116, 4, 145, 117],
          [17, 68, 42],
          [17, 50, 22, 6, 51, 23],
          [19, 46, 16, 6, 47, 17],
          // 22
          [2, 139, 111, 7, 140, 112],
          [17, 74, 46],
          [7, 54, 24, 16, 55, 25],
          [34, 37, 13],
          // 23
          [4, 151, 121, 5, 152, 122],
          [4, 75, 47, 14, 76, 48],
          [11, 54, 24, 14, 55, 25],
          [16, 45, 15, 14, 46, 16],
          // 24
          [6, 147, 117, 4, 148, 118],
          [6, 73, 45, 14, 74, 46],
          [11, 54, 24, 16, 55, 25],
          [30, 46, 16, 2, 47, 17],
          // 25
          [8, 132, 106, 4, 133, 107],
          [8, 75, 47, 13, 76, 48],
          [7, 54, 24, 22, 55, 25],
          [22, 45, 15, 13, 46, 16],
          // 26
          [10, 142, 114, 2, 143, 115],
          [19, 74, 46, 4, 75, 47],
          [28, 50, 22, 6, 51, 23],
          [33, 46, 16, 4, 47, 17],
          // 27
          [8, 152, 122, 4, 153, 123],
          [22, 73, 45, 3, 74, 46],
          [8, 53, 23, 26, 54, 24],
          [12, 45, 15, 28, 46, 16],
          // 28
          [3, 147, 117, 10, 148, 118],
          [3, 73, 45, 23, 74, 46],
          [4, 54, 24, 31, 55, 25],
          [11, 45, 15, 31, 46, 16],
          // 29
          [7, 146, 116, 7, 147, 117],
          [21, 73, 45, 7, 74, 46],
          [1, 53, 23, 37, 54, 24],
          [19, 45, 15, 26, 46, 16],
          // 30
          [5, 145, 115, 10, 146, 116],
          [19, 75, 47, 10, 76, 48],
          [15, 54, 24, 25, 55, 25],
          [23, 45, 15, 25, 46, 16],
          // 31
          [13, 145, 115, 3, 146, 116],
          [2, 74, 46, 29, 75, 47],
          [42, 54, 24, 1, 55, 25],
          [23, 45, 15, 28, 46, 16],
          // 32
          [17, 145, 115],
          [10, 74, 46, 23, 75, 47],
          [10, 54, 24, 35, 55, 25],
          [19, 45, 15, 35, 46, 16],
          // 33
          [17, 145, 115, 1, 146, 116],
          [14, 74, 46, 21, 75, 47],
          [29, 54, 24, 19, 55, 25],
          [11, 45, 15, 46, 46, 16],
          // 34
          [13, 145, 115, 6, 146, 116],
          [14, 74, 46, 23, 75, 47],
          [44, 54, 24, 7, 55, 25],
          [59, 46, 16, 1, 47, 17],
          // 35
          [12, 151, 121, 7, 152, 122],
          [12, 75, 47, 26, 76, 48],
          [39, 54, 24, 14, 55, 25],
          [22, 45, 15, 41, 46, 16],
          // 36
          [6, 151, 121, 14, 152, 122],
          [6, 75, 47, 34, 76, 48],
          [46, 54, 24, 10, 55, 25],
          [2, 45, 15, 64, 46, 16],
          // 37
          [17, 152, 122, 4, 153, 123],
          [29, 74, 46, 14, 75, 47],
          [49, 54, 24, 10, 55, 25],
          [24, 45, 15, 46, 46, 16],
          // 38
          [4, 152, 122, 18, 153, 123],
          [13, 74, 46, 32, 75, 47],
          [48, 54, 24, 14, 55, 25],
          [42, 45, 15, 32, 46, 16],
          // 39
          [20, 147, 117, 4, 148, 118],
          [40, 75, 47, 7, 76, 48],
          [43, 54, 24, 22, 55, 25],
          [10, 45, 15, 67, 46, 16],
          // 40
          [19, 148, 118, 6, 149, 119],
          [18, 75, 47, 31, 76, 48],
          [34, 54, 24, 34, 55, 25],
          [20, 45, 15, 61, 46, 16]
        ];
        var qrRSBlock = function(totalCount, dataCount) {
          var _this2 = {};
          _this2.totalCount = totalCount;
          _this2.dataCount = dataCount;
          return _this2;
        };
        var _this = {};
        var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
          switch (errorCorrectionLevel) {
            case QRErrorCorrectionLevel.L:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
            case QRErrorCorrectionLevel.M:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
            case QRErrorCorrectionLevel.Q:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
            case QRErrorCorrectionLevel.H:
              return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
            default:
              return void 0;
          }
        };
        _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
          var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
          if (typeof rsBlock == "undefined") {
            throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
          }
          var length = rsBlock.length / 3;
          var list = [];
          for (var i = 0; i < length; i += 1) {
            var count = rsBlock[i * 3 + 0];
            var totalCount = rsBlock[i * 3 + 1];
            var dataCount = rsBlock[i * 3 + 2];
            for (var j = 0; j < count; j += 1) {
              list.push(qrRSBlock(totalCount, dataCount));
            }
          }
          return list;
        };
        return _this;
      }();
      var qrBitBuffer = function() {
        var _buffer = [];
        var _length = 0;
        var _this = {};
        _this.getBuffer = function() {
          return _buffer;
        };
        _this.getAt = function(index) {
          var bufIndex = Math.floor(index / 8);
          return (_buffer[bufIndex] >>> 7 - index % 8 & 1) == 1;
        };
        _this.put = function(num, length) {
          for (var i = 0; i < length; i += 1) {
            _this.putBit((num >>> length - i - 1 & 1) == 1);
          }
        };
        _this.getLengthInBits = function() {
          return _length;
        };
        _this.putBit = function(bit) {
          var bufIndex = Math.floor(_length / 8);
          if (_buffer.length <= bufIndex) {
            _buffer.push(0);
          }
          if (bit) {
            _buffer[bufIndex] |= 128 >>> _length % 8;
          }
          _length += 1;
        };
        return _this;
      };
      var qrNumber = function(data) {
        var _mode = QRMode.MODE_NUMBER;
        var _data = data;
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _data.length;
        };
        _this.write = function(buffer) {
          var data2 = _data;
          var i = 0;
          while (i + 2 < data2.length) {
            buffer.put(strToNum(data2.substring(i, i + 3)), 10);
            i += 3;
          }
          if (i < data2.length) {
            if (data2.length - i == 1) {
              buffer.put(strToNum(data2.substring(i, i + 1)), 4);
            } else if (data2.length - i == 2) {
              buffer.put(strToNum(data2.substring(i, i + 2)), 7);
            }
          }
        };
        var strToNum = function(s) {
          var num = 0;
          for (var i = 0; i < s.length; i += 1) {
            num = num * 10 + chatToNum(s.charAt(i));
          }
          return num;
        };
        var chatToNum = function(c) {
          if ("0" <= c && c <= "9") {
            return c.charCodeAt(0) - "0".charCodeAt(0);
          }
          throw "illegal char :" + c;
        };
        return _this;
      };
      var qrAlphaNum = function(data) {
        var _mode = QRMode.MODE_ALPHA_NUM;
        var _data = data;
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _data.length;
        };
        _this.write = function(buffer) {
          var s = _data;
          var i = 0;
          while (i + 1 < s.length) {
            buffer.put(
              getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)),
              11
            );
            i += 2;
          }
          if (i < s.length) {
            buffer.put(getCode(s.charAt(i)), 6);
          }
        };
        var getCode = function(c) {
          if ("0" <= c && c <= "9") {
            return c.charCodeAt(0) - "0".charCodeAt(0);
          } else if ("A" <= c && c <= "Z") {
            return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
          } else {
            switch (c) {
              case " ":
                return 36;
              case "$":
                return 37;
              case "%":
                return 38;
              case "*":
                return 39;
              case "+":
                return 40;
              case "-":
                return 41;
              case ".":
                return 42;
              case "/":
                return 43;
              case ":":
                return 44;
              default:
                throw "illegal char :" + c;
            }
          }
        };
        return _this;
      };
      var qr8BitByte = function(data) {
        var _mode = QRMode.MODE_8BIT_BYTE;
        var _data = data;
        var _bytes = qrcode3.stringToBytes(data);
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return _bytes.length;
        };
        _this.write = function(buffer) {
          for (var i = 0; i < _bytes.length; i += 1) {
            buffer.put(_bytes[i], 8);
          }
        };
        return _this;
      };
      var qrKanji = function(data) {
        var _mode = QRMode.MODE_KANJI;
        var _data = data;
        var stringToBytes = qrcode3.stringToBytesFuncs["SJIS"];
        if (!stringToBytes) {
          throw "sjis not supported.";
        }
        !function(c, code) {
          var test = stringToBytes(c);
          if (test.length != 2 || (test[0] << 8 | test[1]) != code) {
            throw "sjis not supported.";
          }
        }("\u53CB", 38726);
        var _bytes = stringToBytes(data);
        var _this = {};
        _this.getMode = function() {
          return _mode;
        };
        _this.getLength = function(buffer) {
          return ~~(_bytes.length / 2);
        };
        _this.write = function(buffer) {
          var data2 = _bytes;
          var i = 0;
          while (i + 1 < data2.length) {
            var c = (255 & data2[i]) << 8 | 255 & data2[i + 1];
            if (33088 <= c && c <= 40956) {
              c -= 33088;
            } else if (57408 <= c && c <= 60351) {
              c -= 49472;
            } else {
              throw "illegal char at " + (i + 1) + "/" + c;
            }
            c = (c >>> 8 & 255) * 192 + (c & 255);
            buffer.put(c, 13);
            i += 2;
          }
          if (i < data2.length) {
            throw "illegal char at " + (i + 1);
          }
        };
        return _this;
      };
      var byteArrayOutputStream = function() {
        var _bytes = [];
        var _this = {};
        _this.writeByte = function(b) {
          _bytes.push(b & 255);
        };
        _this.writeShort = function(i) {
          _this.writeByte(i);
          _this.writeByte(i >>> 8);
        };
        _this.writeBytes = function(b, off, len) {
          off = off || 0;
          len = len || b.length;
          for (var i = 0; i < len; i += 1) {
            _this.writeByte(b[i + off]);
          }
        };
        _this.writeString = function(s) {
          for (var i = 0; i < s.length; i += 1) {
            _this.writeByte(s.charCodeAt(i));
          }
        };
        _this.toByteArray = function() {
          return _bytes;
        };
        _this.toString = function() {
          var s = "";
          s += "[";
          for (var i = 0; i < _bytes.length; i += 1) {
            if (i > 0) {
              s += ",";
            }
            s += _bytes[i];
          }
          s += "]";
          return s;
        };
        return _this;
      };
      var base64EncodeOutputStream = function() {
        var _buffer = 0;
        var _buflen = 0;
        var _length = 0;
        var _base64 = "";
        var _this = {};
        var writeEncoded = function(b) {
          _base64 += String.fromCharCode(encode(b & 63));
        };
        var encode = function(n) {
          if (n < 0) {
          } else if (n < 26) {
            return 65 + n;
          } else if (n < 52) {
            return 97 + (n - 26);
          } else if (n < 62) {
            return 48 + (n - 52);
          } else if (n == 62) {
            return 43;
          } else if (n == 63) {
            return 47;
          }
          throw "n:" + n;
        };
        _this.writeByte = function(n) {
          _buffer = _buffer << 8 | n & 255;
          _buflen += 8;
          _length += 1;
          while (_buflen >= 6) {
            writeEncoded(_buffer >>> _buflen - 6);
            _buflen -= 6;
          }
        };
        _this.flush = function() {
          if (_buflen > 0) {
            writeEncoded(_buffer << 6 - _buflen);
            _buffer = 0;
            _buflen = 0;
          }
          if (_length % 3 != 0) {
            var padlen = 3 - _length % 3;
            for (var i = 0; i < padlen; i += 1) {
              _base64 += "=";
            }
          }
        };
        _this.toString = function() {
          return _base64;
        };
        return _this;
      };
      var base64DecodeInputStream = function(str) {
        var _str = str;
        var _pos = 0;
        var _buffer = 0;
        var _buflen = 0;
        var _this = {};
        _this.read = function() {
          while (_buflen < 8) {
            if (_pos >= _str.length) {
              if (_buflen == 0) {
                return -1;
              }
              throw "unexpected end of file./" + _buflen;
            }
            var c = _str.charAt(_pos);
            _pos += 1;
            if (c == "=") {
              _buflen = 0;
              return -1;
            } else if (c.match(/^\s$/)) {
              continue;
            }
            _buffer = _buffer << 6 | decode(c.charCodeAt(0));
            _buflen += 6;
          }
          var n = _buffer >>> _buflen - 8 & 255;
          _buflen -= 8;
          return n;
        };
        var decode = function(c) {
          if (65 <= c && c <= 90) {
            return c - 65;
          } else if (97 <= c && c <= 122) {
            return c - 97 + 26;
          } else if (48 <= c && c <= 57) {
            return c - 48 + 52;
          } else if (c == 43) {
            return 62;
          } else if (c == 47) {
            return 63;
          } else {
            throw "c:" + c;
          }
        };
        return _this;
      };
      var gifImage = function(width, height) {
        var _width = width;
        var _height = height;
        var _data = new Array(width * height);
        var _this = {};
        _this.setPixel = function(x, y, pixel) {
          _data[y * _width + x] = pixel;
        };
        _this.write = function(out) {
          out.writeString("GIF87a");
          out.writeShort(_width);
          out.writeShort(_height);
          out.writeByte(128);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(0);
          out.writeByte(255);
          out.writeByte(255);
          out.writeByte(255);
          out.writeString(",");
          out.writeShort(0);
          out.writeShort(0);
          out.writeShort(_width);
          out.writeShort(_height);
          out.writeByte(0);
          var lzwMinCodeSize = 2;
          var raster = getLZWRaster(lzwMinCodeSize);
          out.writeByte(lzwMinCodeSize);
          var offset = 0;
          while (raster.length - offset > 255) {
            out.writeByte(255);
            out.writeBytes(raster, offset, 255);
            offset += 255;
          }
          out.writeByte(raster.length - offset);
          out.writeBytes(raster, offset, raster.length - offset);
          out.writeByte(0);
          out.writeString(";");
        };
        var bitOutputStream = function(out) {
          var _out = out;
          var _bitLength = 0;
          var _bitBuffer = 0;
          var _this2 = {};
          _this2.write = function(data, length) {
            if (data >>> length != 0) {
              throw "length over";
            }
            while (_bitLength + length >= 8) {
              _out.writeByte(255 & (data << _bitLength | _bitBuffer));
              length -= 8 - _bitLength;
              data >>>= 8 - _bitLength;
              _bitBuffer = 0;
              _bitLength = 0;
            }
            _bitBuffer = data << _bitLength | _bitBuffer;
            _bitLength = _bitLength + length;
          };
          _this2.flush = function() {
            if (_bitLength > 0) {
              _out.writeByte(_bitBuffer);
            }
          };
          return _this2;
        };
        var getLZWRaster = function(lzwMinCodeSize) {
          var clearCode = 1 << lzwMinCodeSize;
          var endCode = (1 << lzwMinCodeSize) + 1;
          var bitLength = lzwMinCodeSize + 1;
          var table = lzwTable();
          for (var i = 0; i < clearCode; i += 1) {
            table.add(String.fromCharCode(i));
          }
          table.add(String.fromCharCode(clearCode));
          table.add(String.fromCharCode(endCode));
          var byteOut = byteArrayOutputStream();
          var bitOut = bitOutputStream(byteOut);
          bitOut.write(clearCode, bitLength);
          var dataIndex = 0;
          var s = String.fromCharCode(_data[dataIndex]);
          dataIndex += 1;
          while (dataIndex < _data.length) {
            var c = String.fromCharCode(_data[dataIndex]);
            dataIndex += 1;
            if (table.contains(s + c)) {
              s = s + c;
            } else {
              bitOut.write(table.indexOf(s), bitLength);
              if (table.size() < 4095) {
                if (table.size() == 1 << bitLength) {
                  bitLength += 1;
                }
                table.add(s + c);
              }
              s = c;
            }
          }
          bitOut.write(table.indexOf(s), bitLength);
          bitOut.write(endCode, bitLength);
          bitOut.flush();
          return byteOut.toByteArray();
        };
        var lzwTable = function() {
          var _map = {};
          var _size = 0;
          var _this2 = {};
          _this2.add = function(key) {
            if (_this2.contains(key)) {
              throw "dup key:" + key;
            }
            _map[key] = _size;
            _size += 1;
          };
          _this2.size = function() {
            return _size;
          };
          _this2.indexOf = function(key) {
            return _map[key];
          };
          _this2.contains = function(key) {
            return typeof _map[key] != "undefined";
          };
          return _this2;
        };
        return _this;
      };
      var createDataURL = function(width, height, getPixel) {
        var gif = gifImage(width, height);
        for (var y = 0; y < height; y += 1) {
          for (var x = 0; x < width; x += 1) {
            gif.setPixel(x, y, getPixel(x, y));
          }
        }
        var b = byteArrayOutputStream();
        gif.write(b);
        var base64 = base64EncodeOutputStream();
        var bytes = b.toByteArray();
        for (var i = 0; i < bytes.length; i += 1) {
          base64.writeByte(bytes[i]);
        }
        base64.flush();
        return "data:image/gif;base64," + base64;
      };
      return qrcode3;
    }();
    !function() {
      qrcode2.stringToBytesFuncs["UTF-8"] = function(s) {
        function toUTF8Array(str) {
          var utf8 = [];
          for (var i = 0; i < str.length; i++) {
            var charcode = str.charCodeAt(i);
            if (charcode < 128) utf8.push(charcode);
            else if (charcode < 2048) {
              utf8.push(
                192 | charcode >> 6,
                128 | charcode & 63
              );
            } else if (charcode < 55296 || charcode >= 57344) {
              utf8.push(
                224 | charcode >> 12,
                128 | charcode >> 6 & 63,
                128 | charcode & 63
              );
            } else {
              i++;
              charcode = 65536 + ((charcode & 1023) << 10 | str.charCodeAt(i) & 1023);
              utf8.push(
                240 | charcode >> 18,
                128 | charcode >> 12 & 63,
                128 | charcode >> 6 & 63,
                128 | charcode & 63
              );
            }
          }
          return utf8;
        }
        return toUTF8Array(s);
      };
    }();
    (function(factory) {
      if (typeof define === "function" && define.amd) {
        define([], factory);
      } else if (typeof exports === "object") {
        module2.exports = factory();
      }
    })(function() {
      return qrcode2;
    });
  }
});

// client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_qrcode_generator = __toESM(require_qrcode(), 1);
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots"];
var POLL_MS = 2e3;
async function fetchPairInfo() {
  const res = await fetch("/remote/pair-info");
  if (!res.ok) throw new Error(`pair-info ${res.status}`);
  return await res.json();
}
async function fetchConnected() {
  const res = await fetch("/remote/connected");
  if (!res.ok) return [];
  return await res.json();
}
function buildQrSvg(info) {
  const payload = JSON.stringify({
    v: 1,
    t: "dsh-remote",
    serverId: info.serverId,
    hostname: info.hostname,
    expiresAt: info.expiresAt,
    urls: info.urls
  });
  const qr = (0, import_qrcode_generator.default)(0, "M");
  qr.addData(payload);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
function apply(ctx) {
  ctx.slots.inject(
    "sidebar.footer.action",
    () => ctx.slots.register(
      {
        name: "sidebar.footer.action",
        id: "mobile-pair"
      },
      MobilePairButton
    )
  );
}
function MobilePairButton({ wide }) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [connectedCount, setConnectedCount] = (0, import_react.useState)(0);
  (0, import_react.useEffect)(() => {
    if (!open) return;
    let alive = true;
    const tick = async () => {
      try {
        const devices = await fetchConnected();
        if (alive) setConnectedCount(devices.length);
      } catch {
      }
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [open]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: "rcp-trigger",
        "data-wide": wide ? "true" : "false",
        title: "\u8FDE\u63A5\u79FB\u52A8\u7AEF",
        "aria-label": "\u8FDE\u63A5\u79FB\u52A8\u7AEF",
        onClick: () => setOpen(true),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rcp-trigger-icon", "aria-hidden": true, children: "\u{1F4F1}" }),
          wide ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rcp-trigger-label", children: "\u8FDE\u63A5\u79FB\u52A8\u7AEF" }) : null,
          connectedCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rcp-trigger-dot" }) : null
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Modal,
      {
        open,
        onClose: () => setOpen(false),
        title: "\u8FDE\u63A5\u79FB\u52A8\u7AEF",
        closeLabel: "\u5173\u95ED",
        description: "\u626B\u63CF\u4E8C\u7EF4\u7801\uFF0C\u628A\u624B\u673A\u8FDE\u63A5\u5230\u8FD9\u53F0 DeepSeek Harness",
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PairPanel, { onConnectedCount: setConnectedCount })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: css })
  ] });
}
function PairPanel({ onConnectedCount }) {
  const [phase, setPhase] = (0, import_react.useState)("loading");
  const [pair, setPair] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)("");
  const [devices, setDevices] = (0, import_react.useState)([]);
  const [pairing, setPairing] = (0, import_react.useState)(false);
  const svg = (0, import_react.useMemo)(() => pair ? buildQrSvg(pair) : "", [pair]);
  const refresh = async (silent) => {
    try {
      const info = await fetchPairInfo();
      setPair(info);
      setPhase((cur) => cur === "connected" ? cur : "ready");
    } catch (e) {
      if (!silent) {
        setPhase("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };
  (0, import_react.useEffect)(() => {
    setPhase("loading");
    setPairing(false);
    refresh(false);
    let alive = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const list = await fetchConnected();
        if (!alive) return;
        setDevices(list);
        onConnectedCount(list.length);
        if (list.length > 0) setPhase("connected");
        else setPhase((cur) => cur === "connected" ? "ready" : cur);
      } catch {
      } finally {
        pending = false;
      }
    };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [onConnectedCount]);
  (0, import_react.useEffect)(() => {
    if (!pair || phase === "connected") return;
    const left = pair.expiresAt - Date.now();
    if (left <= 0) {
      refresh(true);
      return;
    }
    const timer = window.setTimeout(() => refresh(true), Math.max(left - 3e3, 1e3));
    return () => window.clearTimeout(timer);
  }, [pair, phase]);
  if (phase === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rcp-state", children: "\u751F\u6210\u4E8C\u7EF4\u7801\u4E2D\u2026" });
  }
  if (phase === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rcp-state rcp-error", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        "\u65E0\u6CD5\u83B7\u53D6\u914D\u5BF9\u4FE1\u606F\uFF1A",
        error
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "rcp-btn", onClick: () => refresh(false), children: "\u91CD\u8BD5" })
    ] });
  }
  if (phase === "connected" && devices.length > 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rcp-connected", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rcp-connected-check", "aria-hidden": true, children: "\u2713" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rcp-connected-title", children: "\u8FDE\u63A5\u6210\u529F" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rcp-connected-devices", children: devices.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rcp-device-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rcp-device-dot" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rcp-device-name", children: d.name }),
        d.model ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rcp-device-model", children: d.model }) : null
      ] }, d.deviceId)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rcp-connected-hint", children: "\u624B\u673A\u65AD\u5F00\u540E\u4F1A\u81EA\u52A8\u56DE\u5230\u914D\u5BF9\u7801" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "rcp-btn rcp-btn-ghost",
          onClick: () => {
            setPairing(true);
            setPhase("ready");
            refresh(false).finally(() => setPairing(false));
          },
          disabled: pairing,
          children: pairing ? "\u5237\u65B0\u4E2D\u2026" : "\u518D\u6B21\u914D\u5BF9"
        }
      )
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rcp-pair", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "rcp-qr", dangerouslySetInnerHTML: { __html: svg } }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rcp-wait", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "rcp-wait-dot" }),
      "\u7B49\u5F85\u624B\u673A\u626B\u7801\u2026"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "rcp-meta", children: [
      pair?.hostname ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "rcp-meta-item", children: [
        "\u{1F5A5} ",
        pair.hostname
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "rcp-meta-item", children: [
        "\u6709\u6548\u671F ",
        countdownOf(pair?.expiresAt)
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "rcp-link", onClick: () => refresh(false), children: "\u5237\u65B0" })
    ] })
  ] });
}
function countdownOf(expiresAt) {
  if (!expiresAt) return "--";
  const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1e3));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
var css = `
.rcp-trigger{
  display:inline-flex;align-items:center;gap:8px;border:none;background:transparent;
  color:var(--dsw-sidebar-fg,#9aa3b8);cursor:pointer;border-radius:8px;
  padding:6px 8px;font-size:13px;line-height:1;position:relative;
}
.rcp-trigger[data-wide="true"]{width:100%;justify-content:flex-start;padding:6px 10px;}
.rcp-trigger:hover{background:var(--dsw-sidebar-hover,rgba(255,255,255,.06));color:var(--dsw-sidebar-fg-active,#e6e9f2);}
.rcp-trigger-icon{font-size:15px;display:inline-flex;align-items:center;}
.rcp-trigger-label{font-weight:500;}
.rcp-trigger-dot{position:absolute;top:4px;right:6px;width:7px;height:7px;border-radius:50%;
  background:#34d399;box-shadow:0 0 6px rgba(52,211,153,.8);}
.rcp-state{padding:18px 8px;text-align:center;color:#9aa3b8;font-size:13px;}
.rcp-error{color:#ff6b6b;}
.rcp-btn{margin-top:10px;border:none;border-radius:8px;padding:7px 16px;cursor:pointer;
  background:#3a5bd9;color:#fff;font-size:13px;}
.rcp-btn:disabled{opacity:.55;cursor:default;}
.rcp-btn-ghost{background:transparent;color:#9aa3b8;border:1px solid #2a3348;}
.rcp-btn-ghost:hover{color:#e6e9f2;}
.rcp-pair{display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0 4px;}
.rcp-qr{background:#fff;border-radius:12px;padding:12px;line-height:0;}
.rcp-qr svg{display:block;width:200px;height:200px;}
.rcp-wait{display:inline-flex;align-items:center;gap:8px;color:#9aa3b8;font-size:13px;}
.rcp-wait-dot{width:8px;height:8px;border-radius:50%;background:#f2c14e;animation:rcp-pulse 1.2s ease-in-out infinite;}
@keyframes rcp-pulse{0%,100%{opacity:.35}50%{opacity:1}}
.rcp-meta{display:flex;align-items:center;gap:14px;color:#6b7280;font-size:12px;flex-wrap:wrap;justify-content:center;}
.rcp-meta-item{display:inline-flex;align-items:center;gap:4px;}
.rcp-link{background:none;border:none;color:#6e9bff;cursor:pointer;font-size:12px;padding:0;}
.rcp-link:hover{text-decoration:underline;}
.rcp-connected{display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 8px 6px;}
.rcp-connected-check{width:52px;height:52px;border-radius:50%;background:rgba(52,211,153,.14);
  color:#34d399;font-size:26px;display:flex;align-items:center;justify-content:center;}
.rcp-connected-title{font-size:16px;font-weight:600;color:#e6e9f2;}
.rcp-connected-devices{display:flex;flex-direction:column;gap:8px;width:100%;max-width:260px;}
.rcp-device-row{display:flex;align-items:center;gap:8px;background:#1e2638;border-radius:10px;padding:10px 12px;}
.rcp-device-dot{width:8px;height:8px;border-radius:50%;background:#34d399;flex:none;}
.rcp-device-name{font-size:13px;font-weight:600;color:#e6e9f2;}
.rcp-device-model{font-size:12px;color:#9aa3b8;margin-left:auto;}
.rcp-connected-hint{font-size:12px;color:#6b7280;}
`;

		return module.exports;
	}
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbm9kZV9tb2R1bGVzLy5wbnBtL3FyY29kZS1nZW5lcmF0b3JAMS41LjIvbm9kZV9tb2R1bGVzL3FyY29kZS1nZW5lcmF0b3IvcXJjb2RlLmpzIiwgIi4uL2NsaWVudC9pbmRleC50c3giXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vL1xuLy8gUVIgQ29kZSBHZW5lcmF0b3IgZm9yIEphdmFTY3JpcHRcbi8vXG4vLyBDb3B5cmlnaHQgKGMpIDIwMDkgS2F6dWhpa28gQXJhc2Vcbi8vXG4vLyBVUkw6IGh0dHA6Ly93d3cuZC1wcm9qZWN0LmNvbS9cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2U6XG4vLyAgaHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5waHBcbi8vXG4vLyBUaGUgd29yZCAnUVIgQ29kZScgaXMgcmVnaXN0ZXJlZCB0cmFkZW1hcmsgb2Zcbi8vIERFTlNPIFdBVkUgSU5DT1JQT1JBVEVEXG4vLyAgaHR0cDovL3d3dy5kZW5zby13YXZlLmNvbS9xcmNvZGUvZmFxcGF0ZW50LWUuaHRtbFxuLy9cbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnZhciBxcmNvZGUgPSBmdW5jdGlvbigpIHtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBxcmNvZGVcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvKipcbiAgICogcXJjb2RlXG4gICAqIEBwYXJhbSB0eXBlTnVtYmVyIDEgdG8gNDBcbiAgICogQHBhcmFtIGVycm9yQ29ycmVjdGlvbkxldmVsICdMJywnTScsJ1EnLCdIJ1xuICAgKi9cbiAgdmFyIHFyY29kZSA9IGZ1bmN0aW9uKHR5cGVOdW1iZXIsIGVycm9yQ29ycmVjdGlvbkxldmVsKSB7XG5cbiAgICB2YXIgUEFEMCA9IDB4RUM7XG4gICAgdmFyIFBBRDEgPSAweDExO1xuXG4gICAgdmFyIF90eXBlTnVtYmVyID0gdHlwZU51bWJlcjtcbiAgICB2YXIgX2Vycm9yQ29ycmVjdGlvbkxldmVsID0gUVJFcnJvckNvcnJlY3Rpb25MZXZlbFtlcnJvckNvcnJlY3Rpb25MZXZlbF07XG4gICAgdmFyIF9tb2R1bGVzID0gbnVsbDtcbiAgICB2YXIgX21vZHVsZUNvdW50ID0gMDtcbiAgICB2YXIgX2RhdGFDYWNoZSA9IG51bGw7XG4gICAgdmFyIF9kYXRhTGlzdCA9IFtdO1xuXG4gICAgdmFyIF90aGlzID0ge307XG5cbiAgICB2YXIgbWFrZUltcGwgPSBmdW5jdGlvbih0ZXN0LCBtYXNrUGF0dGVybikge1xuXG4gICAgICBfbW9kdWxlQ291bnQgPSBfdHlwZU51bWJlciAqIDQgKyAxNztcbiAgICAgIF9tb2R1bGVzID0gZnVuY3Rpb24obW9kdWxlQ291bnQpIHtcbiAgICAgICAgdmFyIG1vZHVsZXMgPSBuZXcgQXJyYXkobW9kdWxlQ291bnQpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSAwOyByb3cgPCBtb2R1bGVDb3VudDsgcm93ICs9IDEpIHtcbiAgICAgICAgICBtb2R1bGVzW3Jvd10gPSBuZXcgQXJyYXkobW9kdWxlQ291bnQpO1xuICAgICAgICAgIGZvciAodmFyIGNvbCA9IDA7IGNvbCA8IG1vZHVsZUNvdW50OyBjb2wgKz0gMSkge1xuICAgICAgICAgICAgbW9kdWxlc1tyb3ddW2NvbF0gPSBudWxsO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbW9kdWxlcztcbiAgICAgIH0oX21vZHVsZUNvdW50KTtcblxuICAgICAgc2V0dXBQb3NpdGlvblByb2JlUGF0dGVybigwLCAwKTtcbiAgICAgIHNldHVwUG9zaXRpb25Qcm9iZVBhdHRlcm4oX21vZHVsZUNvdW50IC0gNywgMCk7XG4gICAgICBzZXR1cFBvc2l0aW9uUHJvYmVQYXR0ZXJuKDAsIF9tb2R1bGVDb3VudCAtIDcpO1xuICAgICAgc2V0dXBQb3NpdGlvbkFkanVzdFBhdHRlcm4oKTtcbiAgICAgIHNldHVwVGltaW5nUGF0dGVybigpO1xuICAgICAgc2V0dXBUeXBlSW5mbyh0ZXN0LCBtYXNrUGF0dGVybik7XG5cbiAgICAgIGlmIChfdHlwZU51bWJlciA+PSA3KSB7XG4gICAgICAgIHNldHVwVHlwZU51bWJlcih0ZXN0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKF9kYXRhQ2FjaGUgPT0gbnVsbCkge1xuICAgICAgICBfZGF0YUNhY2hlID0gY3JlYXRlRGF0YShfdHlwZU51bWJlciwgX2Vycm9yQ29ycmVjdGlvbkxldmVsLCBfZGF0YUxpc3QpO1xuICAgICAgfVxuXG4gICAgICBtYXBEYXRhKF9kYXRhQ2FjaGUsIG1hc2tQYXR0ZXJuKTtcbiAgICB9O1xuXG4gICAgdmFyIHNldHVwUG9zaXRpb25Qcm9iZVBhdHRlcm4gPSBmdW5jdGlvbihyb3csIGNvbCkge1xuXG4gICAgICBmb3IgKHZhciByID0gLTE7IHIgPD0gNzsgciArPSAxKSB7XG5cbiAgICAgICAgaWYgKHJvdyArIHIgPD0gLTEgfHwgX21vZHVsZUNvdW50IDw9IHJvdyArIHIpIGNvbnRpbnVlO1xuXG4gICAgICAgIGZvciAodmFyIGMgPSAtMTsgYyA8PSA3OyBjICs9IDEpIHtcblxuICAgICAgICAgIGlmIChjb2wgKyBjIDw9IC0xIHx8IF9tb2R1bGVDb3VudCA8PSBjb2wgKyBjKSBjb250aW51ZTtcblxuICAgICAgICAgIGlmICggKDAgPD0gciAmJiByIDw9IDYgJiYgKGMgPT0gMCB8fCBjID09IDYpIClcbiAgICAgICAgICAgICAgfHwgKDAgPD0gYyAmJiBjIDw9IDYgJiYgKHIgPT0gMCB8fCByID09IDYpIClcbiAgICAgICAgICAgICAgfHwgKDIgPD0gciAmJiByIDw9IDQgJiYgMiA8PSBjICYmIGMgPD0gNCkgKSB7XG4gICAgICAgICAgICBfbW9kdWxlc1tyb3cgKyByXVtjb2wgKyBjXSA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIF9tb2R1bGVzW3JvdyArIHJdW2NvbCArIGNdID0gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZhciBnZXRCZXN0TWFza1BhdHRlcm4gPSBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIG1pbkxvc3RQb2ludCA9IDA7XG4gICAgICB2YXIgcGF0dGVybiA9IDA7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgODsgaSArPSAxKSB7XG5cbiAgICAgICAgbWFrZUltcGwodHJ1ZSwgaSk7XG5cbiAgICAgICAgdmFyIGxvc3RQb2ludCA9IFFSVXRpbC5nZXRMb3N0UG9pbnQoX3RoaXMpO1xuXG4gICAgICAgIGlmIChpID09IDAgfHwgbWluTG9zdFBvaW50ID4gbG9zdFBvaW50KSB7XG4gICAgICAgICAgbWluTG9zdFBvaW50ID0gbG9zdFBvaW50O1xuICAgICAgICAgIHBhdHRlcm4gPSBpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwYXR0ZXJuO1xuICAgIH07XG5cbiAgICB2YXIgc2V0dXBUaW1pbmdQYXR0ZXJuID0gZnVuY3Rpb24oKSB7XG5cbiAgICAgIGZvciAodmFyIHIgPSA4OyByIDwgX21vZHVsZUNvdW50IC0gODsgciArPSAxKSB7XG4gICAgICAgIGlmIChfbW9kdWxlc1tyXVs2XSAhPSBudWxsKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgX21vZHVsZXNbcl1bNl0gPSAociAlIDIgPT0gMCk7XG4gICAgICB9XG5cbiAgICAgIGZvciAodmFyIGMgPSA4OyBjIDwgX21vZHVsZUNvdW50IC0gODsgYyArPSAxKSB7XG4gICAgICAgIGlmIChfbW9kdWxlc1s2XVtjXSAhPSBudWxsKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgX21vZHVsZXNbNl1bY10gPSAoYyAlIDIgPT0gMCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZhciBzZXR1cFBvc2l0aW9uQWRqdXN0UGF0dGVybiA9IGZ1bmN0aW9uKCkge1xuXG4gICAgICB2YXIgcG9zID0gUVJVdGlsLmdldFBhdHRlcm5Qb3NpdGlvbihfdHlwZU51bWJlcik7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcG9zLmxlbmd0aDsgaSArPSAxKSB7XG5cbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBwb3MubGVuZ3RoOyBqICs9IDEpIHtcblxuICAgICAgICAgIHZhciByb3cgPSBwb3NbaV07XG4gICAgICAgICAgdmFyIGNvbCA9IHBvc1tqXTtcblxuICAgICAgICAgIGlmIChfbW9kdWxlc1tyb3ddW2NvbF0gIT0gbnVsbCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZm9yICh2YXIgciA9IC0yOyByIDw9IDI7IHIgKz0gMSkge1xuXG4gICAgICAgICAgICBmb3IgKHZhciBjID0gLTI7IGMgPD0gMjsgYyArPSAxKSB7XG5cbiAgICAgICAgICAgICAgaWYgKHIgPT0gLTIgfHwgciA9PSAyIHx8IGMgPT0gLTIgfHwgYyA9PSAyXG4gICAgICAgICAgICAgICAgICB8fCAociA9PSAwICYmIGMgPT0gMCkgKSB7XG4gICAgICAgICAgICAgICAgX21vZHVsZXNbcm93ICsgcl1bY29sICsgY10gPSB0cnVlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIF9tb2R1bGVzW3JvdyArIHJdW2NvbCArIGNdID0gZmFsc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIHNldHVwVHlwZU51bWJlciA9IGZ1bmN0aW9uKHRlc3QpIHtcblxuICAgICAgdmFyIGJpdHMgPSBRUlV0aWwuZ2V0QkNIVHlwZU51bWJlcihfdHlwZU51bWJlcik7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMTg7IGkgKz0gMSkge1xuICAgICAgICB2YXIgbW9kID0gKCF0ZXN0ICYmICggKGJpdHMgPj4gaSkgJiAxKSA9PSAxKTtcbiAgICAgICAgX21vZHVsZXNbTWF0aC5mbG9vcihpIC8gMyldW2kgJSAzICsgX21vZHVsZUNvdW50IC0gOCAtIDNdID0gbW9kO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDE4OyBpICs9IDEpIHtcbiAgICAgICAgdmFyIG1vZCA9ICghdGVzdCAmJiAoIChiaXRzID4+IGkpICYgMSkgPT0gMSk7XG4gICAgICAgIF9tb2R1bGVzW2kgJSAzICsgX21vZHVsZUNvdW50IC0gOCAtIDNdW01hdGguZmxvb3IoaSAvIDMpXSA9IG1vZDtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIHNldHVwVHlwZUluZm8gPSBmdW5jdGlvbih0ZXN0LCBtYXNrUGF0dGVybikge1xuXG4gICAgICB2YXIgZGF0YSA9IChfZXJyb3JDb3JyZWN0aW9uTGV2ZWwgPDwgMykgfCBtYXNrUGF0dGVybjtcbiAgICAgIHZhciBiaXRzID0gUVJVdGlsLmdldEJDSFR5cGVJbmZvKGRhdGEpO1xuXG4gICAgICAvLyB2ZXJ0aWNhbFxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAxNTsgaSArPSAxKSB7XG5cbiAgICAgICAgdmFyIG1vZCA9ICghdGVzdCAmJiAoIChiaXRzID4+IGkpICYgMSkgPT0gMSk7XG5cbiAgICAgICAgaWYgKGkgPCA2KSB7XG4gICAgICAgICAgX21vZHVsZXNbaV1bOF0gPSBtb2Q7XG4gICAgICAgIH0gZWxzZSBpZiAoaSA8IDgpIHtcbiAgICAgICAgICBfbW9kdWxlc1tpICsgMV1bOF0gPSBtb2Q7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgX21vZHVsZXNbX21vZHVsZUNvdW50IC0gMTUgKyBpXVs4XSA9IG1vZDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBob3Jpem9udGFsXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDE1OyBpICs9IDEpIHtcblxuICAgICAgICB2YXIgbW9kID0gKCF0ZXN0ICYmICggKGJpdHMgPj4gaSkgJiAxKSA9PSAxKTtcblxuICAgICAgICBpZiAoaSA8IDgpIHtcbiAgICAgICAgICBfbW9kdWxlc1s4XVtfbW9kdWxlQ291bnQgLSBpIC0gMV0gPSBtb2Q7XG4gICAgICAgIH0gZWxzZSBpZiAoaSA8IDkpIHtcbiAgICAgICAgICBfbW9kdWxlc1s4XVsxNSAtIGkgLSAxICsgMV0gPSBtb2Q7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgX21vZHVsZXNbOF1bMTUgLSBpIC0gMV0gPSBtb2Q7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gZml4ZWQgbW9kdWxlXG4gICAgICBfbW9kdWxlc1tfbW9kdWxlQ291bnQgLSA4XVs4XSA9ICghdGVzdCk7XG4gICAgfTtcblxuICAgIHZhciBtYXBEYXRhID0gZnVuY3Rpb24oZGF0YSwgbWFza1BhdHRlcm4pIHtcblxuICAgICAgdmFyIGluYyA9IC0xO1xuICAgICAgdmFyIHJvdyA9IF9tb2R1bGVDb3VudCAtIDE7XG4gICAgICB2YXIgYml0SW5kZXggPSA3O1xuICAgICAgdmFyIGJ5dGVJbmRleCA9IDA7XG4gICAgICB2YXIgbWFza0Z1bmMgPSBRUlV0aWwuZ2V0TWFza0Z1bmN0aW9uKG1hc2tQYXR0ZXJuKTtcblxuICAgICAgZm9yICh2YXIgY29sID0gX21vZHVsZUNvdW50IC0gMTsgY29sID4gMDsgY29sIC09IDIpIHtcblxuICAgICAgICBpZiAoY29sID09IDYpIGNvbCAtPSAxO1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG5cbiAgICAgICAgICBmb3IgKHZhciBjID0gMDsgYyA8IDI7IGMgKz0gMSkge1xuXG4gICAgICAgICAgICBpZiAoX21vZHVsZXNbcm93XVtjb2wgLSBjXSA9PSBudWxsKSB7XG5cbiAgICAgICAgICAgICAgdmFyIGRhcmsgPSBmYWxzZTtcblxuICAgICAgICAgICAgICBpZiAoYnl0ZUluZGV4IDwgZGF0YS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBkYXJrID0gKCAoIChkYXRhW2J5dGVJbmRleF0gPj4+IGJpdEluZGV4KSAmIDEpID09IDEpO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdmFyIG1hc2sgPSBtYXNrRnVuYyhyb3csIGNvbCAtIGMpO1xuXG4gICAgICAgICAgICAgIGlmIChtYXNrKSB7XG4gICAgICAgICAgICAgICAgZGFyayA9ICFkYXJrO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgX21vZHVsZXNbcm93XVtjb2wgLSBjXSA9IGRhcms7XG4gICAgICAgICAgICAgIGJpdEluZGV4IC09IDE7XG5cbiAgICAgICAgICAgICAgaWYgKGJpdEluZGV4ID09IC0xKSB7XG4gICAgICAgICAgICAgICAgYnl0ZUluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgYml0SW5kZXggPSA3O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcm93ICs9IGluYztcblxuICAgICAgICAgIGlmIChyb3cgPCAwIHx8IF9tb2R1bGVDb3VudCA8PSByb3cpIHtcbiAgICAgICAgICAgIHJvdyAtPSBpbmM7XG4gICAgICAgICAgICBpbmMgPSAtaW5jO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZhciBjcmVhdGVCeXRlcyA9IGZ1bmN0aW9uKGJ1ZmZlciwgcnNCbG9ja3MpIHtcblxuICAgICAgdmFyIG9mZnNldCA9IDA7XG5cbiAgICAgIHZhciBtYXhEY0NvdW50ID0gMDtcbiAgICAgIHZhciBtYXhFY0NvdW50ID0gMDtcblxuICAgICAgdmFyIGRjZGF0YSA9IG5ldyBBcnJheShyc0Jsb2Nrcy5sZW5ndGgpO1xuICAgICAgdmFyIGVjZGF0YSA9IG5ldyBBcnJheShyc0Jsb2Nrcy5sZW5ndGgpO1xuXG4gICAgICBmb3IgKHZhciByID0gMDsgciA8IHJzQmxvY2tzLmxlbmd0aDsgciArPSAxKSB7XG5cbiAgICAgICAgdmFyIGRjQ291bnQgPSByc0Jsb2Nrc1tyXS5kYXRhQ291bnQ7XG4gICAgICAgIHZhciBlY0NvdW50ID0gcnNCbG9ja3Nbcl0udG90YWxDb3VudCAtIGRjQ291bnQ7XG5cbiAgICAgICAgbWF4RGNDb3VudCA9IE1hdGgubWF4KG1heERjQ291bnQsIGRjQ291bnQpO1xuICAgICAgICBtYXhFY0NvdW50ID0gTWF0aC5tYXgobWF4RWNDb3VudCwgZWNDb3VudCk7XG5cbiAgICAgICAgZGNkYXRhW3JdID0gbmV3IEFycmF5KGRjQ291bnQpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGNkYXRhW3JdLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgZGNkYXRhW3JdW2ldID0gMHhmZiAmIGJ1ZmZlci5nZXRCdWZmZXIoKVtpICsgb2Zmc2V0XTtcbiAgICAgICAgfVxuICAgICAgICBvZmZzZXQgKz0gZGNDb3VudDtcblxuICAgICAgICB2YXIgcnNQb2x5ID0gUVJVdGlsLmdldEVycm9yQ29ycmVjdFBvbHlub21pYWwoZWNDb3VudCk7XG4gICAgICAgIHZhciByYXdQb2x5ID0gcXJQb2x5bm9taWFsKGRjZGF0YVtyXSwgcnNQb2x5LmdldExlbmd0aCgpIC0gMSk7XG5cbiAgICAgICAgdmFyIG1vZFBvbHkgPSByYXdQb2x5Lm1vZChyc1BvbHkpO1xuICAgICAgICBlY2RhdGFbcl0gPSBuZXcgQXJyYXkocnNQb2x5LmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZWNkYXRhW3JdLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgdmFyIG1vZEluZGV4ID0gaSArIG1vZFBvbHkuZ2V0TGVuZ3RoKCkgLSBlY2RhdGFbcl0ubGVuZ3RoO1xuICAgICAgICAgIGVjZGF0YVtyXVtpXSA9IChtb2RJbmRleCA+PSAwKT8gbW9kUG9seS5nZXRBdChtb2RJbmRleCkgOiAwO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHZhciB0b3RhbENvZGVDb3VudCA9IDA7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJzQmxvY2tzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgIHRvdGFsQ29kZUNvdW50ICs9IHJzQmxvY2tzW2ldLnRvdGFsQ291bnQ7XG4gICAgICB9XG5cbiAgICAgIHZhciBkYXRhID0gbmV3IEFycmF5KHRvdGFsQ29kZUNvdW50KTtcbiAgICAgIHZhciBpbmRleCA9IDA7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWF4RGNDb3VudDsgaSArPSAxKSB7XG4gICAgICAgIGZvciAodmFyIHIgPSAwOyByIDwgcnNCbG9ja3MubGVuZ3RoOyByICs9IDEpIHtcbiAgICAgICAgICBpZiAoaSA8IGRjZGF0YVtyXS5sZW5ndGgpIHtcbiAgICAgICAgICAgIGRhdGFbaW5kZXhdID0gZGNkYXRhW3JdW2ldO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXhFY0NvdW50OyBpICs9IDEpIHtcbiAgICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCByc0Jsb2Nrcy5sZW5ndGg7IHIgKz0gMSkge1xuICAgICAgICAgIGlmIChpIDwgZWNkYXRhW3JdLmxlbmd0aCkge1xuICAgICAgICAgICAgZGF0YVtpbmRleF0gPSBlY2RhdGFbcl1baV07XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gZGF0YTtcbiAgICB9O1xuXG4gICAgdmFyIGNyZWF0ZURhdGEgPSBmdW5jdGlvbih0eXBlTnVtYmVyLCBlcnJvckNvcnJlY3Rpb25MZXZlbCwgZGF0YUxpc3QpIHtcblxuICAgICAgdmFyIHJzQmxvY2tzID0gUVJSU0Jsb2NrLmdldFJTQmxvY2tzKHR5cGVOdW1iZXIsIGVycm9yQ29ycmVjdGlvbkxldmVsKTtcblxuICAgICAgdmFyIGJ1ZmZlciA9IHFyQml0QnVmZmVyKCk7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YUxpc3QubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgdmFyIGRhdGEgPSBkYXRhTGlzdFtpXTtcbiAgICAgICAgYnVmZmVyLnB1dChkYXRhLmdldE1vZGUoKSwgNCk7XG4gICAgICAgIGJ1ZmZlci5wdXQoZGF0YS5nZXRMZW5ndGgoKSwgUVJVdGlsLmdldExlbmd0aEluQml0cyhkYXRhLmdldE1vZGUoKSwgdHlwZU51bWJlcikgKTtcbiAgICAgICAgZGF0YS53cml0ZShidWZmZXIpO1xuICAgICAgfVxuXG4gICAgICAvLyBjYWxjIG51bSBtYXggZGF0YS5cbiAgICAgIHZhciB0b3RhbERhdGFDb3VudCA9IDA7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJzQmxvY2tzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgIHRvdGFsRGF0YUNvdW50ICs9IHJzQmxvY2tzW2ldLmRhdGFDb3VudDtcbiAgICAgIH1cblxuICAgICAgaWYgKGJ1ZmZlci5nZXRMZW5ndGhJbkJpdHMoKSA+IHRvdGFsRGF0YUNvdW50ICogOCkge1xuICAgICAgICB0aHJvdyAnY29kZSBsZW5ndGggb3ZlcmZsb3cuICgnXG4gICAgICAgICAgKyBidWZmZXIuZ2V0TGVuZ3RoSW5CaXRzKClcbiAgICAgICAgICArICc+J1xuICAgICAgICAgICsgdG90YWxEYXRhQ291bnQgKiA4XG4gICAgICAgICAgKyAnKSc7XG4gICAgICB9XG5cbiAgICAgIC8vIGVuZCBjb2RlXG4gICAgICBpZiAoYnVmZmVyLmdldExlbmd0aEluQml0cygpICsgNCA8PSB0b3RhbERhdGFDb3VudCAqIDgpIHtcbiAgICAgICAgYnVmZmVyLnB1dCgwLCA0KTtcbiAgICAgIH1cblxuICAgICAgLy8gcGFkZGluZ1xuICAgICAgd2hpbGUgKGJ1ZmZlci5nZXRMZW5ndGhJbkJpdHMoKSAlIDggIT0gMCkge1xuICAgICAgICBidWZmZXIucHV0Qml0KGZhbHNlKTtcbiAgICAgIH1cblxuICAgICAgLy8gcGFkZGluZ1xuICAgICAgd2hpbGUgKHRydWUpIHtcblxuICAgICAgICBpZiAoYnVmZmVyLmdldExlbmd0aEluQml0cygpID49IHRvdGFsRGF0YUNvdW50ICogOCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGJ1ZmZlci5wdXQoUEFEMCwgOCk7XG5cbiAgICAgICAgaWYgKGJ1ZmZlci5nZXRMZW5ndGhJbkJpdHMoKSA+PSB0b3RhbERhdGFDb3VudCAqIDgpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBidWZmZXIucHV0KFBBRDEsIDgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gY3JlYXRlQnl0ZXMoYnVmZmVyLCByc0Jsb2Nrcyk7XG4gICAgfTtcblxuICAgIF90aGlzLmFkZERhdGEgPSBmdW5jdGlvbihkYXRhLCBtb2RlKSB7XG5cbiAgICAgIG1vZGUgPSBtb2RlIHx8ICdCeXRlJztcblxuICAgICAgdmFyIG5ld0RhdGEgPSBudWxsO1xuXG4gICAgICBzd2l0Y2gobW9kZSkge1xuICAgICAgY2FzZSAnTnVtZXJpYycgOlxuICAgICAgICBuZXdEYXRhID0gcXJOdW1iZXIoZGF0YSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnQWxwaGFudW1lcmljJyA6XG4gICAgICAgIG5ld0RhdGEgPSBxckFscGhhTnVtKGRhdGEpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0J5dGUnIDpcbiAgICAgICAgbmV3RGF0YSA9IHFyOEJpdEJ5dGUoZGF0YSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnS2FuamknIDpcbiAgICAgICAgbmV3RGF0YSA9IHFyS2FuamkoZGF0YSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdCA6XG4gICAgICAgIHRocm93ICdtb2RlOicgKyBtb2RlO1xuICAgICAgfVxuXG4gICAgICBfZGF0YUxpc3QucHVzaChuZXdEYXRhKTtcbiAgICAgIF9kYXRhQ2FjaGUgPSBudWxsO1xuICAgIH07XG5cbiAgICBfdGhpcy5pc0RhcmsgPSBmdW5jdGlvbihyb3csIGNvbCkge1xuICAgICAgaWYgKHJvdyA8IDAgfHwgX21vZHVsZUNvdW50IDw9IHJvdyB8fCBjb2wgPCAwIHx8IF9tb2R1bGVDb3VudCA8PSBjb2wpIHtcbiAgICAgICAgdGhyb3cgcm93ICsgJywnICsgY29sO1xuICAgICAgfVxuICAgICAgcmV0dXJuIF9tb2R1bGVzW3Jvd11bY29sXTtcbiAgICB9O1xuXG4gICAgX3RoaXMuZ2V0TW9kdWxlQ291bnQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBfbW9kdWxlQ291bnQ7XG4gICAgfTtcblxuICAgIF90aGlzLm1ha2UgPSBmdW5jdGlvbigpIHtcbiAgICAgIGlmIChfdHlwZU51bWJlciA8IDEpIHtcbiAgICAgICAgdmFyIHR5cGVOdW1iZXIgPSAxO1xuXG4gICAgICAgIGZvciAoOyB0eXBlTnVtYmVyIDwgNDA7IHR5cGVOdW1iZXIrKykge1xuICAgICAgICAgIHZhciByc0Jsb2NrcyA9IFFSUlNCbG9jay5nZXRSU0Jsb2Nrcyh0eXBlTnVtYmVyLCBfZXJyb3JDb3JyZWN0aW9uTGV2ZWwpO1xuICAgICAgICAgIHZhciBidWZmZXIgPSBxckJpdEJ1ZmZlcigpO1xuXG4gICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBfZGF0YUxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gX2RhdGFMaXN0W2ldO1xuICAgICAgICAgICAgYnVmZmVyLnB1dChkYXRhLmdldE1vZGUoKSwgNCk7XG4gICAgICAgICAgICBidWZmZXIucHV0KGRhdGEuZ2V0TGVuZ3RoKCksIFFSVXRpbC5nZXRMZW5ndGhJbkJpdHMoZGF0YS5nZXRNb2RlKCksIHR5cGVOdW1iZXIpICk7XG4gICAgICAgICAgICBkYXRhLndyaXRlKGJ1ZmZlcik7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIHRvdGFsRGF0YUNvdW50ID0gMDtcbiAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJzQmxvY2tzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0b3RhbERhdGFDb3VudCArPSByc0Jsb2Nrc1tpXS5kYXRhQ291bnQ7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGJ1ZmZlci5nZXRMZW5ndGhJbkJpdHMoKSA8PSB0b3RhbERhdGFDb3VudCAqIDgpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIF90eXBlTnVtYmVyID0gdHlwZU51bWJlcjtcbiAgICAgIH1cblxuICAgICAgbWFrZUltcGwoZmFsc2UsIGdldEJlc3RNYXNrUGF0dGVybigpICk7XG4gICAgfTtcblxuICAgIF90aGlzLmNyZWF0ZVRhYmxlVGFnID0gZnVuY3Rpb24oY2VsbFNpemUsIG1hcmdpbikge1xuXG4gICAgICBjZWxsU2l6ZSA9IGNlbGxTaXplIHx8IDI7XG4gICAgICBtYXJnaW4gPSAodHlwZW9mIG1hcmdpbiA9PSAndW5kZWZpbmVkJyk/IGNlbGxTaXplICogNCA6IG1hcmdpbjtcblxuICAgICAgdmFyIHFySHRtbCA9ICcnO1xuXG4gICAgICBxckh0bWwgKz0gJzx0YWJsZSBzdHlsZT1cIic7XG4gICAgICBxckh0bWwgKz0gJyBib3JkZXItd2lkdGg6IDBweDsgYm9yZGVyLXN0eWxlOiBub25lOyc7XG4gICAgICBxckh0bWwgKz0gJyBib3JkZXItY29sbGFwc2U6IGNvbGxhcHNlOyc7XG4gICAgICBxckh0bWwgKz0gJyBwYWRkaW5nOiAwcHg7IG1hcmdpbjogJyArIG1hcmdpbiArICdweDsnO1xuICAgICAgcXJIdG1sICs9ICdcIj4nO1xuICAgICAgcXJIdG1sICs9ICc8dGJvZHk+JztcblxuICAgICAgZm9yICh2YXIgciA9IDA7IHIgPCBfdGhpcy5nZXRNb2R1bGVDb3VudCgpOyByICs9IDEpIHtcblxuICAgICAgICBxckh0bWwgKz0gJzx0cj4nO1xuXG4gICAgICAgIGZvciAodmFyIGMgPSAwOyBjIDwgX3RoaXMuZ2V0TW9kdWxlQ291bnQoKTsgYyArPSAxKSB7XG4gICAgICAgICAgcXJIdG1sICs9ICc8dGQgc3R5bGU9XCInO1xuICAgICAgICAgIHFySHRtbCArPSAnIGJvcmRlci13aWR0aDogMHB4OyBib3JkZXItc3R5bGU6IG5vbmU7JztcbiAgICAgICAgICBxckh0bWwgKz0gJyBib3JkZXItY29sbGFwc2U6IGNvbGxhcHNlOyc7XG4gICAgICAgICAgcXJIdG1sICs9ICcgcGFkZGluZzogMHB4OyBtYXJnaW46IDBweDsnO1xuICAgICAgICAgIHFySHRtbCArPSAnIHdpZHRoOiAnICsgY2VsbFNpemUgKyAncHg7JztcbiAgICAgICAgICBxckh0bWwgKz0gJyBoZWlnaHQ6ICcgKyBjZWxsU2l6ZSArICdweDsnO1xuICAgICAgICAgIHFySHRtbCArPSAnIGJhY2tncm91bmQtY29sb3I6ICc7XG4gICAgICAgICAgcXJIdG1sICs9IF90aGlzLmlzRGFyayhyLCBjKT8gJyMwMDAwMDAnIDogJyNmZmZmZmYnO1xuICAgICAgICAgIHFySHRtbCArPSAnOyc7XG4gICAgICAgICAgcXJIdG1sICs9ICdcIi8+JztcbiAgICAgICAgfVxuXG4gICAgICAgIHFySHRtbCArPSAnPC90cj4nO1xuICAgICAgfVxuXG4gICAgICBxckh0bWwgKz0gJzwvdGJvZHk+JztcbiAgICAgIHFySHRtbCArPSAnPC90YWJsZT4nO1xuXG4gICAgICByZXR1cm4gcXJIdG1sO1xuICAgIH07XG5cbiAgICBfdGhpcy5jcmVhdGVTdmdUYWcgPSBmdW5jdGlvbihjZWxsU2l6ZSwgbWFyZ2luLCBhbHQsIHRpdGxlKSB7XG5cbiAgICAgIHZhciBvcHRzID0ge307XG4gICAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PSAnb2JqZWN0Jykge1xuICAgICAgICAvLyBDYWxsZWQgYnkgb3B0aW9ucy5cbiAgICAgICAgb3B0cyA9IGFyZ3VtZW50c1swXTtcbiAgICAgICAgLy8gb3ZlcndyaXRlIGNlbGxTaXplIGFuZCBtYXJnaW4uXG4gICAgICAgIGNlbGxTaXplID0gb3B0cy5jZWxsU2l6ZTtcbiAgICAgICAgbWFyZ2luID0gb3B0cy5tYXJnaW47XG4gICAgICAgIGFsdCA9IG9wdHMuYWx0O1xuICAgICAgICB0aXRsZSA9IG9wdHMudGl0bGU7XG4gICAgICB9XG5cbiAgICAgIGNlbGxTaXplID0gY2VsbFNpemUgfHwgMjtcbiAgICAgIG1hcmdpbiA9ICh0eXBlb2YgbWFyZ2luID09ICd1bmRlZmluZWQnKT8gY2VsbFNpemUgKiA0IDogbWFyZ2luO1xuXG4gICAgICAvLyBDb21wb3NlIGFsdCBwcm9wZXJ0eSBzdXJyb2dhdGVcbiAgICAgIGFsdCA9ICh0eXBlb2YgYWx0ID09PSAnc3RyaW5nJykgPyB7dGV4dDogYWx0fSA6IGFsdCB8fCB7fTtcbiAgICAgIGFsdC50ZXh0ID0gYWx0LnRleHQgfHwgbnVsbDtcbiAgICAgIGFsdC5pZCA9IChhbHQudGV4dCkgPyBhbHQuaWQgfHwgJ3FyY29kZS1kZXNjcmlwdGlvbicgOiBudWxsO1xuXG4gICAgICAvLyBDb21wb3NlIHRpdGxlIHByb3BlcnR5IHN1cnJvZ2F0ZVxuICAgICAgdGl0bGUgPSAodHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJykgPyB7dGV4dDogdGl0bGV9IDogdGl0bGUgfHwge307XG4gICAgICB0aXRsZS50ZXh0ID0gdGl0bGUudGV4dCB8fCBudWxsO1xuICAgICAgdGl0bGUuaWQgPSAodGl0bGUudGV4dCkgPyB0aXRsZS5pZCB8fCAncXJjb2RlLXRpdGxlJyA6IG51bGw7XG5cbiAgICAgIHZhciBzaXplID0gX3RoaXMuZ2V0TW9kdWxlQ291bnQoKSAqIGNlbGxTaXplICsgbWFyZ2luICogMjtcbiAgICAgIHZhciBjLCBtYywgciwgbXIsIHFyU3ZnPScnLCByZWN0O1xuXG4gICAgICByZWN0ID0gJ2wnICsgY2VsbFNpemUgKyAnLDAgMCwnICsgY2VsbFNpemUgK1xuICAgICAgICAnIC0nICsgY2VsbFNpemUgKyAnLDAgMCwtJyArIGNlbGxTaXplICsgJ3ogJztcblxuICAgICAgcXJTdmcgKz0gJzxzdmcgdmVyc2lvbj1cIjEuMVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIic7XG4gICAgICBxclN2ZyArPSAhb3B0cy5zY2FsYWJsZSA/ICcgd2lkdGg9XCInICsgc2l6ZSArICdweFwiIGhlaWdodD1cIicgKyBzaXplICsgJ3B4XCInIDogJyc7XG4gICAgICBxclN2ZyArPSAnIHZpZXdCb3g9XCIwIDAgJyArIHNpemUgKyAnICcgKyBzaXplICsgJ1wiICc7XG4gICAgICBxclN2ZyArPSAnIHByZXNlcnZlQXNwZWN0UmF0aW89XCJ4TWluWU1pbiBtZWV0XCInO1xuICAgICAgcXJTdmcgKz0gKHRpdGxlLnRleHQgfHwgYWx0LnRleHQpID8gJyByb2xlPVwiaW1nXCIgYXJpYS1sYWJlbGxlZGJ5PVwiJyArXG4gICAgICAgICAgZXNjYXBlWG1sKFt0aXRsZS5pZCwgYWx0LmlkXS5qb2luKCcgJykudHJpbSgpICkgKyAnXCInIDogJyc7XG4gICAgICBxclN2ZyArPSAnPic7XG4gICAgICBxclN2ZyArPSAodGl0bGUudGV4dCkgPyAnPHRpdGxlIGlkPVwiJyArIGVzY2FwZVhtbCh0aXRsZS5pZCkgKyAnXCI+JyArXG4gICAgICAgICAgZXNjYXBlWG1sKHRpdGxlLnRleHQpICsgJzwvdGl0bGU+JyA6ICcnO1xuICAgICAgcXJTdmcgKz0gKGFsdC50ZXh0KSA/ICc8ZGVzY3JpcHRpb24gaWQ9XCInICsgZXNjYXBlWG1sKGFsdC5pZCkgKyAnXCI+JyArXG4gICAgICAgICAgZXNjYXBlWG1sKGFsdC50ZXh0KSArICc8L2Rlc2NyaXB0aW9uPicgOiAnJztcbiAgICAgIHFyU3ZnICs9ICc8cmVjdCB3aWR0aD1cIjEwMCVcIiBoZWlnaHQ9XCIxMDAlXCIgZmlsbD1cIndoaXRlXCIgY3g9XCIwXCIgY3k9XCIwXCIvPic7XG4gICAgICBxclN2ZyArPSAnPHBhdGggZD1cIic7XG5cbiAgICAgIGZvciAociA9IDA7IHIgPCBfdGhpcy5nZXRNb2R1bGVDb3VudCgpOyByICs9IDEpIHtcbiAgICAgICAgbXIgPSByICogY2VsbFNpemUgKyBtYXJnaW47XG4gICAgICAgIGZvciAoYyA9IDA7IGMgPCBfdGhpcy5nZXRNb2R1bGVDb3VudCgpOyBjICs9IDEpIHtcbiAgICAgICAgICBpZiAoX3RoaXMuaXNEYXJrKHIsIGMpICkge1xuICAgICAgICAgICAgbWMgPSBjKmNlbGxTaXplK21hcmdpbjtcbiAgICAgICAgICAgIHFyU3ZnICs9ICdNJyArIG1jICsgJywnICsgbXIgKyByZWN0O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBxclN2ZyArPSAnXCIgc3Ryb2tlPVwidHJhbnNwYXJlbnRcIiBmaWxsPVwiYmxhY2tcIi8+JztcbiAgICAgIHFyU3ZnICs9ICc8L3N2Zz4nO1xuXG4gICAgICByZXR1cm4gcXJTdmc7XG4gICAgfTtcblxuICAgIF90aGlzLmNyZWF0ZURhdGFVUkwgPSBmdW5jdGlvbihjZWxsU2l6ZSwgbWFyZ2luKSB7XG5cbiAgICAgIGNlbGxTaXplID0gY2VsbFNpemUgfHwgMjtcbiAgICAgIG1hcmdpbiA9ICh0eXBlb2YgbWFyZ2luID09ICd1bmRlZmluZWQnKT8gY2VsbFNpemUgKiA0IDogbWFyZ2luO1xuXG4gICAgICB2YXIgc2l6ZSA9IF90aGlzLmdldE1vZHVsZUNvdW50KCkgKiBjZWxsU2l6ZSArIG1hcmdpbiAqIDI7XG4gICAgICB2YXIgbWluID0gbWFyZ2luO1xuICAgICAgdmFyIG1heCA9IHNpemUgLSBtYXJnaW47XG5cbiAgICAgIHJldHVybiBjcmVhdGVEYXRhVVJMKHNpemUsIHNpemUsIGZ1bmN0aW9uKHgsIHkpIHtcbiAgICAgICAgaWYgKG1pbiA8PSB4ICYmIHggPCBtYXggJiYgbWluIDw9IHkgJiYgeSA8IG1heCkge1xuICAgICAgICAgIHZhciBjID0gTWF0aC5mbG9vciggKHggLSBtaW4pIC8gY2VsbFNpemUpO1xuICAgICAgICAgIHZhciByID0gTWF0aC5mbG9vciggKHkgLSBtaW4pIC8gY2VsbFNpemUpO1xuICAgICAgICAgIHJldHVybiBfdGhpcy5pc0RhcmsociwgYyk/IDAgOiAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICB9ICk7XG4gICAgfTtcblxuICAgIF90aGlzLmNyZWF0ZUltZ1RhZyA9IGZ1bmN0aW9uKGNlbGxTaXplLCBtYXJnaW4sIGFsdCkge1xuXG4gICAgICBjZWxsU2l6ZSA9IGNlbGxTaXplIHx8IDI7XG4gICAgICBtYXJnaW4gPSAodHlwZW9mIG1hcmdpbiA9PSAndW5kZWZpbmVkJyk/IGNlbGxTaXplICogNCA6IG1hcmdpbjtcblxuICAgICAgdmFyIHNpemUgPSBfdGhpcy5nZXRNb2R1bGVDb3VudCgpICogY2VsbFNpemUgKyBtYXJnaW4gKiAyO1xuXG4gICAgICB2YXIgaW1nID0gJyc7XG4gICAgICBpbWcgKz0gJzxpbWcnO1xuICAgICAgaW1nICs9ICdcXHUwMDIwc3JjPVwiJztcbiAgICAgIGltZyArPSBfdGhpcy5jcmVhdGVEYXRhVVJMKGNlbGxTaXplLCBtYXJnaW4pO1xuICAgICAgaW1nICs9ICdcIic7XG4gICAgICBpbWcgKz0gJ1xcdTAwMjB3aWR0aD1cIic7XG4gICAgICBpbWcgKz0gc2l6ZTtcbiAgICAgIGltZyArPSAnXCInO1xuICAgICAgaW1nICs9ICdcXHUwMDIwaGVpZ2h0PVwiJztcbiAgICAgIGltZyArPSBzaXplO1xuICAgICAgaW1nICs9ICdcIic7XG4gICAgICBpZiAoYWx0KSB7XG4gICAgICAgIGltZyArPSAnXFx1MDAyMGFsdD1cIic7XG4gICAgICAgIGltZyArPSBlc2NhcGVYbWwoYWx0KTtcbiAgICAgICAgaW1nICs9ICdcIic7XG4gICAgICB9XG4gICAgICBpbWcgKz0gJy8+JztcblxuICAgICAgcmV0dXJuIGltZztcbiAgICB9O1xuXG4gICAgdmFyIGVzY2FwZVhtbCA9IGZ1bmN0aW9uKHMpIHtcbiAgICAgIHZhciBlc2NhcGVkID0gJyc7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgdmFyIGMgPSBzLmNoYXJBdChpKTtcbiAgICAgICAgc3dpdGNoKGMpIHtcbiAgICAgICAgY2FzZSAnPCc6IGVzY2FwZWQgKz0gJyZsdDsnOyBicmVhaztcbiAgICAgICAgY2FzZSAnPic6IGVzY2FwZWQgKz0gJyZndDsnOyBicmVhaztcbiAgICAgICAgY2FzZSAnJic6IGVzY2FwZWQgKz0gJyZhbXA7JzsgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1wiJzogZXNjYXBlZCArPSAnJnF1b3Q7JzsgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQgOiBlc2NhcGVkICs9IGM7IGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gZXNjYXBlZDtcbiAgICB9O1xuXG4gICAgdmFyIF9jcmVhdGVIYWxmQVNDSUkgPSBmdW5jdGlvbihtYXJnaW4pIHtcbiAgICAgIHZhciBjZWxsU2l6ZSA9IDE7XG4gICAgICBtYXJnaW4gPSAodHlwZW9mIG1hcmdpbiA9PSAndW5kZWZpbmVkJyk/IGNlbGxTaXplICogMiA6IG1hcmdpbjtcblxuICAgICAgdmFyIHNpemUgPSBfdGhpcy5nZXRNb2R1bGVDb3VudCgpICogY2VsbFNpemUgKyBtYXJnaW4gKiAyO1xuICAgICAgdmFyIG1pbiA9IG1hcmdpbjtcbiAgICAgIHZhciBtYXggPSBzaXplIC0gbWFyZ2luO1xuXG4gICAgICB2YXIgeSwgeCwgcjEsIHIyLCBwO1xuXG4gICAgICB2YXIgYmxvY2tzID0ge1xuICAgICAgICAnXHUyNTg4XHUyNTg4JzogJ1x1MjU4OCcsXG4gICAgICAgICdcdTI1ODggJzogJ1x1MjU4MCcsXG4gICAgICAgICcgXHUyNTg4JzogJ1x1MjU4NCcsXG4gICAgICAgICcgICc6ICcgJ1xuICAgICAgfTtcblxuICAgICAgdmFyIGJsb2Nrc0xhc3RMaW5lTm9NYXJnaW4gPSB7XG4gICAgICAgICdcdTI1ODhcdTI1ODgnOiAnXHUyNTgwJyxcbiAgICAgICAgJ1x1MjU4OCAnOiAnXHUyNTgwJyxcbiAgICAgICAgJyBcdTI1ODgnOiAnICcsXG4gICAgICAgICcgICc6ICcgJ1xuICAgICAgfTtcblxuICAgICAgdmFyIGFzY2lpID0gJyc7XG4gICAgICBmb3IgKHkgPSAwOyB5IDwgc2l6ZTsgeSArPSAyKSB7XG4gICAgICAgIHIxID0gTWF0aC5mbG9vcigoeSAtIG1pbikgLyBjZWxsU2l6ZSk7XG4gICAgICAgIHIyID0gTWF0aC5mbG9vcigoeSArIDEgLSBtaW4pIC8gY2VsbFNpemUpO1xuICAgICAgICBmb3IgKHggPSAwOyB4IDwgc2l6ZTsgeCArPSAxKSB7XG4gICAgICAgICAgcCA9ICdcdTI1ODgnO1xuXG4gICAgICAgICAgaWYgKG1pbiA8PSB4ICYmIHggPCBtYXggJiYgbWluIDw9IHkgJiYgeSA8IG1heCAmJiBfdGhpcy5pc0RhcmsocjEsIE1hdGguZmxvb3IoKHggLSBtaW4pIC8gY2VsbFNpemUpKSkge1xuICAgICAgICAgICAgcCA9ICcgJztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobWluIDw9IHggJiYgeCA8IG1heCAmJiBtaW4gPD0geSsxICYmIHkrMSA8IG1heCAmJiBfdGhpcy5pc0RhcmsocjIsIE1hdGguZmxvb3IoKHggLSBtaW4pIC8gY2VsbFNpemUpKSkge1xuICAgICAgICAgICAgcCArPSAnICc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcCArPSAnXHUyNTg4JztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBPdXRwdXQgMiBjaGFyYWN0ZXJzIHBlciBwaXhlbCwgdG8gY3JlYXRlIGZ1bGwgc3F1YXJlLiAxIGNoYXJhY3RlciBwZXIgcGl4ZWxzIGdpdmVzIG9ubHkgaGFsZiB3aWR0aCBvZiBzcXVhcmUuXG4gICAgICAgICAgYXNjaWkgKz0gKG1hcmdpbiA8IDEgJiYgeSsxID49IG1heCkgPyBibG9ja3NMYXN0TGluZU5vTWFyZ2luW3BdIDogYmxvY2tzW3BdO1xuICAgICAgICB9XG5cbiAgICAgICAgYXNjaWkgKz0gJ1xcbic7XG4gICAgICB9XG5cbiAgICAgIGlmIChzaXplICUgMiAmJiBtYXJnaW4gPiAwKSB7XG4gICAgICAgIHJldHVybiBhc2NpaS5zdWJzdHJpbmcoMCwgYXNjaWkubGVuZ3RoIC0gc2l6ZSAtIDEpICsgQXJyYXkoc2l6ZSsxKS5qb2luKCdcdTI1ODAnKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGFzY2lpLnN1YnN0cmluZygwLCBhc2NpaS5sZW5ndGgtMSk7XG4gICAgfTtcblxuICAgIF90aGlzLmNyZWF0ZUFTQ0lJID0gZnVuY3Rpb24oY2VsbFNpemUsIG1hcmdpbikge1xuICAgICAgY2VsbFNpemUgPSBjZWxsU2l6ZSB8fCAxO1xuXG4gICAgICBpZiAoY2VsbFNpemUgPCAyKSB7XG4gICAgICAgIHJldHVybiBfY3JlYXRlSGFsZkFTQ0lJKG1hcmdpbik7XG4gICAgICB9XG5cbiAgICAgIGNlbGxTaXplIC09IDE7XG4gICAgICBtYXJnaW4gPSAodHlwZW9mIG1hcmdpbiA9PSAndW5kZWZpbmVkJyk/IGNlbGxTaXplICogMiA6IG1hcmdpbjtcblxuICAgICAgdmFyIHNpemUgPSBfdGhpcy5nZXRNb2R1bGVDb3VudCgpICogY2VsbFNpemUgKyBtYXJnaW4gKiAyO1xuICAgICAgdmFyIG1pbiA9IG1hcmdpbjtcbiAgICAgIHZhciBtYXggPSBzaXplIC0gbWFyZ2luO1xuXG4gICAgICB2YXIgeSwgeCwgciwgcDtcblxuICAgICAgdmFyIHdoaXRlID0gQXJyYXkoY2VsbFNpemUrMSkuam9pbignXHUyNTg4XHUyNTg4Jyk7XG4gICAgICB2YXIgYmxhY2sgPSBBcnJheShjZWxsU2l6ZSsxKS5qb2luKCcgICcpO1xuXG4gICAgICB2YXIgYXNjaWkgPSAnJztcbiAgICAgIHZhciBsaW5lID0gJyc7XG4gICAgICBmb3IgKHkgPSAwOyB5IDwgc2l6ZTsgeSArPSAxKSB7XG4gICAgICAgIHIgPSBNYXRoLmZsb29yKCAoeSAtIG1pbikgLyBjZWxsU2l6ZSk7XG4gICAgICAgIGxpbmUgPSAnJztcbiAgICAgICAgZm9yICh4ID0gMDsgeCA8IHNpemU7IHggKz0gMSkge1xuICAgICAgICAgIHAgPSAxO1xuXG4gICAgICAgICAgaWYgKG1pbiA8PSB4ICYmIHggPCBtYXggJiYgbWluIDw9IHkgJiYgeSA8IG1heCAmJiBfdGhpcy5pc0RhcmsociwgTWF0aC5mbG9vcigoeCAtIG1pbikgLyBjZWxsU2l6ZSkpKSB7XG4gICAgICAgICAgICBwID0gMDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBPdXRwdXQgMiBjaGFyYWN0ZXJzIHBlciBwaXhlbCwgdG8gY3JlYXRlIGZ1bGwgc3F1YXJlLiAxIGNoYXJhY3RlciBwZXIgcGl4ZWxzIGdpdmVzIG9ubHkgaGFsZiB3aWR0aCBvZiBzcXVhcmUuXG4gICAgICAgICAgbGluZSArPSBwID8gd2hpdGUgOiBibGFjaztcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAociA9IDA7IHIgPCBjZWxsU2l6ZTsgciArPSAxKSB7XG4gICAgICAgICAgYXNjaWkgKz0gbGluZSArICdcXG4nO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBhc2NpaS5zdWJzdHJpbmcoMCwgYXNjaWkubGVuZ3RoLTEpO1xuICAgIH07XG5cbiAgICBfdGhpcy5yZW5kZXJUbzJkQ29udGV4dCA9IGZ1bmN0aW9uKGNvbnRleHQsIGNlbGxTaXplKSB7XG4gICAgICBjZWxsU2l6ZSA9IGNlbGxTaXplIHx8IDI7XG4gICAgICB2YXIgbGVuZ3RoID0gX3RoaXMuZ2V0TW9kdWxlQ291bnQoKTtcbiAgICAgIGZvciAodmFyIHJvdyA9IDA7IHJvdyA8IGxlbmd0aDsgcm93KyspIHtcbiAgICAgICAgZm9yICh2YXIgY29sID0gMDsgY29sIDwgbGVuZ3RoOyBjb2wrKykge1xuICAgICAgICAgIGNvbnRleHQuZmlsbFN0eWxlID0gX3RoaXMuaXNEYXJrKHJvdywgY29sKSA/ICdibGFjaycgOiAnd2hpdGUnO1xuICAgICAgICAgIGNvbnRleHQuZmlsbFJlY3Qocm93ICogY2VsbFNpemUsIGNvbCAqIGNlbGxTaXplLCBjZWxsU2l6ZSwgY2VsbFNpemUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIF90aGlzO1xuICB9O1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIHFyY29kZS5zdHJpbmdUb0J5dGVzXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgcXJjb2RlLnN0cmluZ1RvQnl0ZXNGdW5jcyA9IHtcbiAgICAnZGVmYXVsdCcgOiBmdW5jdGlvbihzKSB7XG4gICAgICB2YXIgYnl0ZXMgPSBbXTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICB2YXIgYyA9IHMuY2hhckNvZGVBdChpKTtcbiAgICAgICAgYnl0ZXMucHVzaChjICYgMHhmZik7XG4gICAgICB9XG4gICAgICByZXR1cm4gYnl0ZXM7XG4gICAgfVxuICB9O1xuXG4gIHFyY29kZS5zdHJpbmdUb0J5dGVzID0gcXJjb2RlLnN0cmluZ1RvQnl0ZXNGdW5jc1snZGVmYXVsdCddO1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIHFyY29kZS5jcmVhdGVTdHJpbmdUb0J5dGVzXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLyoqXG4gICAqIEBwYXJhbSB1bmljb2RlRGF0YSBiYXNlNjQgc3RyaW5nIG9mIGJ5dGUgYXJyYXkuXG4gICAqIFsxNmJpdCBVbmljb2RlXSxbMTZiaXQgQnl0ZXNdLCAuLi5cbiAgICogQHBhcmFtIG51bUNoYXJzXG4gICAqL1xuICBxcmNvZGUuY3JlYXRlU3RyaW5nVG9CeXRlcyA9IGZ1bmN0aW9uKHVuaWNvZGVEYXRhLCBudW1DaGFycykge1xuXG4gICAgLy8gY3JlYXRlIGNvbnZlcnNpb24gbWFwLlxuXG4gICAgdmFyIHVuaWNvZGVNYXAgPSBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIGJpbiA9IGJhc2U2NERlY29kZUlucHV0U3RyZWFtKHVuaWNvZGVEYXRhKTtcbiAgICAgIHZhciByZWFkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBiID0gYmluLnJlYWQoKTtcbiAgICAgICAgaWYgKGIgPT0gLTEpIHRocm93ICdlb2YnO1xuICAgICAgICByZXR1cm4gYjtcbiAgICAgIH07XG5cbiAgICAgIHZhciBjb3VudCA9IDA7XG4gICAgICB2YXIgdW5pY29kZU1hcCA9IHt9O1xuICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgdmFyIGIwID0gYmluLnJlYWQoKTtcbiAgICAgICAgaWYgKGIwID09IC0xKSBicmVhaztcbiAgICAgICAgdmFyIGIxID0gcmVhZCgpO1xuICAgICAgICB2YXIgYjIgPSByZWFkKCk7XG4gICAgICAgIHZhciBiMyA9IHJlYWQoKTtcbiAgICAgICAgdmFyIGsgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKCAoYjAgPDwgOCkgfCBiMSk7XG4gICAgICAgIHZhciB2ID0gKGIyIDw8IDgpIHwgYjM7XG4gICAgICAgIHVuaWNvZGVNYXBba10gPSB2O1xuICAgICAgICBjb3VudCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKGNvdW50ICE9IG51bUNoYXJzKSB7XG4gICAgICAgIHRocm93IGNvdW50ICsgJyAhPSAnICsgbnVtQ2hhcnM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB1bmljb2RlTWFwO1xuICAgIH0oKTtcblxuICAgIHZhciB1bmtub3duQ2hhciA9ICc/Jy5jaGFyQ29kZUF0KDApO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHMpIHtcbiAgICAgIHZhciBieXRlcyA9IFtdO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgIHZhciBjID0gcy5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoYyA8IDEyOCkge1xuICAgICAgICAgIGJ5dGVzLnB1c2goYyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFyIGIgPSB1bmljb2RlTWFwW3MuY2hhckF0KGkpXTtcbiAgICAgICAgICBpZiAodHlwZW9mIGIgPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIGlmICggKGIgJiAweGZmKSA9PSBiKSB7XG4gICAgICAgICAgICAgIC8vIDFieXRlXG4gICAgICAgICAgICAgIGJ5dGVzLnB1c2goYik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyAyYnl0ZXNcbiAgICAgICAgICAgICAgYnl0ZXMucHVzaChiID4+PiA4KTtcbiAgICAgICAgICAgICAgYnl0ZXMucHVzaChiICYgMHhmZik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJ5dGVzLnB1c2godW5rbm93bkNoYXIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGJ5dGVzO1xuICAgIH07XG4gIH07XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gUVJNb2RlXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgdmFyIFFSTW9kZSA9IHtcbiAgICBNT0RFX05VTUJFUiA6ICAgIDEgPDwgMCxcbiAgICBNT0RFX0FMUEhBX05VTSA6IDEgPDwgMSxcbiAgICBNT0RFXzhCSVRfQllURSA6IDEgPDwgMixcbiAgICBNT0RFX0tBTkpJIDogICAgIDEgPDwgM1xuICB9O1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFFSRXJyb3JDb3JyZWN0aW9uTGV2ZWxcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICB2YXIgUVJFcnJvckNvcnJlY3Rpb25MZXZlbCA9IHtcbiAgICBMIDogMSxcbiAgICBNIDogMCxcbiAgICBRIDogMyxcbiAgICBIIDogMlxuICB9O1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFFSTWFza1BhdHRlcm5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICB2YXIgUVJNYXNrUGF0dGVybiA9IHtcbiAgICBQQVRURVJOMDAwIDogMCxcbiAgICBQQVRURVJOMDAxIDogMSxcbiAgICBQQVRURVJOMDEwIDogMixcbiAgICBQQVRURVJOMDExIDogMyxcbiAgICBQQVRURVJOMTAwIDogNCxcbiAgICBQQVRURVJOMTAxIDogNSxcbiAgICBQQVRURVJOMTEwIDogNixcbiAgICBQQVRURVJOMTExIDogN1xuICB9O1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIFFSVXRpbFxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHZhciBRUlV0aWwgPSBmdW5jdGlvbigpIHtcblxuICAgIHZhciBQQVRURVJOX1BPU0lUSU9OX1RBQkxFID0gW1xuICAgICAgW10sXG4gICAgICBbNiwgMThdLFxuICAgICAgWzYsIDIyXSxcbiAgICAgIFs2LCAyNl0sXG4gICAgICBbNiwgMzBdLFxuICAgICAgWzYsIDM0XSxcbiAgICAgIFs2LCAyMiwgMzhdLFxuICAgICAgWzYsIDI0LCA0Ml0sXG4gICAgICBbNiwgMjYsIDQ2XSxcbiAgICAgIFs2LCAyOCwgNTBdLFxuICAgICAgWzYsIDMwLCA1NF0sXG4gICAgICBbNiwgMzIsIDU4XSxcbiAgICAgIFs2LCAzNCwgNjJdLFxuICAgICAgWzYsIDI2LCA0NiwgNjZdLFxuICAgICAgWzYsIDI2LCA0OCwgNzBdLFxuICAgICAgWzYsIDI2LCA1MCwgNzRdLFxuICAgICAgWzYsIDMwLCA1NCwgNzhdLFxuICAgICAgWzYsIDMwLCA1NiwgODJdLFxuICAgICAgWzYsIDMwLCA1OCwgODZdLFxuICAgICAgWzYsIDM0LCA2MiwgOTBdLFxuICAgICAgWzYsIDI4LCA1MCwgNzIsIDk0XSxcbiAgICAgIFs2LCAyNiwgNTAsIDc0LCA5OF0sXG4gICAgICBbNiwgMzAsIDU0LCA3OCwgMTAyXSxcbiAgICAgIFs2LCAyOCwgNTQsIDgwLCAxMDZdLFxuICAgICAgWzYsIDMyLCA1OCwgODQsIDExMF0sXG4gICAgICBbNiwgMzAsIDU4LCA4NiwgMTE0XSxcbiAgICAgIFs2LCAzNCwgNjIsIDkwLCAxMThdLFxuICAgICAgWzYsIDI2LCA1MCwgNzQsIDk4LCAxMjJdLFxuICAgICAgWzYsIDMwLCA1NCwgNzgsIDEwMiwgMTI2XSxcbiAgICAgIFs2LCAyNiwgNTIsIDc4LCAxMDQsIDEzMF0sXG4gICAgICBbNiwgMzAsIDU2LCA4MiwgMTA4LCAxMzRdLFxuICAgICAgWzYsIDM0LCA2MCwgODYsIDExMiwgMTM4XSxcbiAgICAgIFs2LCAzMCwgNTgsIDg2LCAxMTQsIDE0Ml0sXG4gICAgICBbNiwgMzQsIDYyLCA5MCwgMTE4LCAxNDZdLFxuICAgICAgWzYsIDMwLCA1NCwgNzgsIDEwMiwgMTI2LCAxNTBdLFxuICAgICAgWzYsIDI0LCA1MCwgNzYsIDEwMiwgMTI4LCAxNTRdLFxuICAgICAgWzYsIDI4LCA1NCwgODAsIDEwNiwgMTMyLCAxNThdLFxuICAgICAgWzYsIDMyLCA1OCwgODQsIDExMCwgMTM2LCAxNjJdLFxuICAgICAgWzYsIDI2LCA1NCwgODIsIDExMCwgMTM4LCAxNjZdLFxuICAgICAgWzYsIDMwLCA1OCwgODYsIDExNCwgMTQyLCAxNzBdXG4gICAgXTtcbiAgICB2YXIgRzE1ID0gKDEgPDwgMTApIHwgKDEgPDwgOCkgfCAoMSA8PCA1KSB8ICgxIDw8IDQpIHwgKDEgPDwgMikgfCAoMSA8PCAxKSB8ICgxIDw8IDApO1xuICAgIHZhciBHMTggPSAoMSA8PCAxMikgfCAoMSA8PCAxMSkgfCAoMSA8PCAxMCkgfCAoMSA8PCA5KSB8ICgxIDw8IDgpIHwgKDEgPDwgNSkgfCAoMSA8PCAyKSB8ICgxIDw8IDApO1xuICAgIHZhciBHMTVfTUFTSyA9ICgxIDw8IDE0KSB8ICgxIDw8IDEyKSB8ICgxIDw8IDEwKSB8ICgxIDw8IDQpIHwgKDEgPDwgMSk7XG5cbiAgICB2YXIgX3RoaXMgPSB7fTtcblxuICAgIHZhciBnZXRCQ0hEaWdpdCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHZhciBkaWdpdCA9IDA7XG4gICAgICB3aGlsZSAoZGF0YSAhPSAwKSB7XG4gICAgICAgIGRpZ2l0ICs9IDE7XG4gICAgICAgIGRhdGEgPj4+PSAxO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGRpZ2l0O1xuICAgIH07XG5cbiAgICBfdGhpcy5nZXRCQ0hUeXBlSW5mbyA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHZhciBkID0gZGF0YSA8PCAxMDtcbiAgICAgIHdoaWxlIChnZXRCQ0hEaWdpdChkKSAtIGdldEJDSERpZ2l0KEcxNSkgPj0gMCkge1xuICAgICAgICBkIF49IChHMTUgPDwgKGdldEJDSERpZ2l0KGQpIC0gZ2V0QkNIRGlnaXQoRzE1KSApICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gKCAoZGF0YSA8PCAxMCkgfCBkKSBeIEcxNV9NQVNLO1xuICAgIH07XG5cbiAgICBfdGhpcy5nZXRCQ0hUeXBlTnVtYmVyID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgdmFyIGQgPSBkYXRhIDw8IDEyO1xuICAgICAgd2hpbGUgKGdldEJDSERpZ2l0KGQpIC0gZ2V0QkNIRGlnaXQoRzE4KSA+PSAwKSB7XG4gICAgICAgIGQgXj0gKEcxOCA8PCAoZ2V0QkNIRGlnaXQoZCkgLSBnZXRCQ0hEaWdpdChHMTgpICkgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAoZGF0YSA8PCAxMikgfCBkO1xuICAgIH07XG5cbiAgICBfdGhpcy5nZXRQYXR0ZXJuUG9zaXRpb24gPSBmdW5jdGlvbih0eXBlTnVtYmVyKSB7XG4gICAgICByZXR1cm4gUEFUVEVSTl9QT1NJVElPTl9UQUJMRVt0eXBlTnVtYmVyIC0gMV07XG4gICAgfTtcblxuICAgIF90aGlzLmdldE1hc2tGdW5jdGlvbiA9IGZ1bmN0aW9uKG1hc2tQYXR0ZXJuKSB7XG5cbiAgICAgIHN3aXRjaCAobWFza1BhdHRlcm4pIHtcblxuICAgICAgY2FzZSBRUk1hc2tQYXR0ZXJuLlBBVFRFUk4wMDAgOlxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oaSwgaikgeyByZXR1cm4gKGkgKyBqKSAlIDIgPT0gMDsgfTtcbiAgICAgIGNhc2UgUVJNYXNrUGF0dGVybi5QQVRURVJOMDAxIDpcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGksIGopIHsgcmV0dXJuIGkgJSAyID09IDA7IH07XG4gICAgICBjYXNlIFFSTWFza1BhdHRlcm4uUEFUVEVSTjAxMCA6XG4gICAgICAgIHJldHVybiBmdW5jdGlvbihpLCBqKSB7IHJldHVybiBqICUgMyA9PSAwOyB9O1xuICAgICAgY2FzZSBRUk1hc2tQYXR0ZXJuLlBBVFRFUk4wMTEgOlxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oaSwgaikgeyByZXR1cm4gKGkgKyBqKSAlIDMgPT0gMDsgfTtcbiAgICAgIGNhc2UgUVJNYXNrUGF0dGVybi5QQVRURVJOMTAwIDpcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGksIGopIHsgcmV0dXJuIChNYXRoLmZsb29yKGkgLyAyKSArIE1hdGguZmxvb3IoaiAvIDMpICkgJSAyID09IDA7IH07XG4gICAgICBjYXNlIFFSTWFza1BhdHRlcm4uUEFUVEVSTjEwMSA6XG4gICAgICAgIHJldHVybiBmdW5jdGlvbihpLCBqKSB7IHJldHVybiAoaSAqIGopICUgMiArIChpICogaikgJSAzID09IDA7IH07XG4gICAgICBjYXNlIFFSTWFza1BhdHRlcm4uUEFUVEVSTjExMCA6XG4gICAgICAgIHJldHVybiBmdW5jdGlvbihpLCBqKSB7IHJldHVybiAoIChpICogaikgJSAyICsgKGkgKiBqKSAlIDMpICUgMiA9PSAwOyB9O1xuICAgICAgY2FzZSBRUk1hc2tQYXR0ZXJuLlBBVFRFUk4xMTEgOlxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oaSwgaikgeyByZXR1cm4gKCAoaSAqIGopICUgMyArIChpICsgaikgJSAyKSAlIDIgPT0gMDsgfTtcblxuICAgICAgZGVmYXVsdCA6XG4gICAgICAgIHRocm93ICdiYWQgbWFza1BhdHRlcm46JyArIG1hc2tQYXR0ZXJuO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBfdGhpcy5nZXRFcnJvckNvcnJlY3RQb2x5bm9taWFsID0gZnVuY3Rpb24oZXJyb3JDb3JyZWN0TGVuZ3RoKSB7XG4gICAgICB2YXIgYSA9IHFyUG9seW5vbWlhbChbMV0sIDApO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlcnJvckNvcnJlY3RMZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBhID0gYS5tdWx0aXBseShxclBvbHlub21pYWwoWzEsIFFSTWF0aC5nZXhwKGkpXSwgMCkgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhO1xuICAgIH07XG5cbiAgICBfdGhpcy5nZXRMZW5ndGhJbkJpdHMgPSBmdW5jdGlvbihtb2RlLCB0eXBlKSB7XG5cbiAgICAgIGlmICgxIDw9IHR5cGUgJiYgdHlwZSA8IDEwKSB7XG5cbiAgICAgICAgLy8gMSAtIDlcblxuICAgICAgICBzd2l0Y2gobW9kZSkge1xuICAgICAgICBjYXNlIFFSTW9kZS5NT0RFX05VTUJFUiAgICA6IHJldHVybiAxMDtcbiAgICAgICAgY2FzZSBRUk1vZGUuTU9ERV9BTFBIQV9OVU0gOiByZXR1cm4gOTtcbiAgICAgICAgY2FzZSBRUk1vZGUuTU9ERV84QklUX0JZVEUgOiByZXR1cm4gODtcbiAgICAgICAgY2FzZSBRUk1vZGUuTU9ERV9LQU5KSSAgICAgOiByZXR1cm4gODtcbiAgICAgICAgZGVmYXVsdCA6XG4gICAgICAgICAgdGhyb3cgJ21vZGU6JyArIG1vZGU7XG4gICAgICAgIH1cblxuICAgICAgfSBlbHNlIGlmICh0eXBlIDwgMjcpIHtcblxuICAgICAgICAvLyAxMCAtIDI2XG5cbiAgICAgICAgc3dpdGNoKG1vZGUpIHtcbiAgICAgICAgY2FzZSBRUk1vZGUuTU9ERV9OVU1CRVIgICAgOiByZXR1cm4gMTI7XG4gICAgICAgIGNhc2UgUVJNb2RlLk1PREVfQUxQSEFfTlVNIDogcmV0dXJuIDExO1xuICAgICAgICBjYXNlIFFSTW9kZS5NT0RFXzhCSVRfQllURSA6IHJldHVybiAxNjtcbiAgICAgICAgY2FzZSBRUk1vZGUuTU9ERV9LQU5KSSAgICAgOiByZXR1cm4gMTA7XG4gICAgICAgIGRlZmF1bHQgOlxuICAgICAgICAgIHRocm93ICdtb2RlOicgKyBtb2RlO1xuICAgICAgICB9XG5cbiAgICAgIH0gZWxzZSBpZiAodHlwZSA8IDQxKSB7XG5cbiAgICAgICAgLy8gMjcgLSA0MFxuXG4gICAgICAgIHN3aXRjaChtb2RlKSB7XG4gICAgICAgIGNhc2UgUVJNb2RlLk1PREVfTlVNQkVSICAgIDogcmV0dXJuIDE0O1xuICAgICAgICBjYXNlIFFSTW9kZS5NT0RFX0FMUEhBX05VTSA6IHJldHVybiAxMztcbiAgICAgICAgY2FzZSBRUk1vZGUuTU9ERV84QklUX0JZVEUgOiByZXR1cm4gMTY7XG4gICAgICAgIGNhc2UgUVJNb2RlLk1PREVfS0FOSkkgICAgIDogcmV0dXJuIDEyO1xuICAgICAgICBkZWZhdWx0IDpcbiAgICAgICAgICB0aHJvdyAnbW9kZTonICsgbW9kZTtcbiAgICAgICAgfVxuXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAndHlwZTonICsgdHlwZTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgX3RoaXMuZ2V0TG9zdFBvaW50ID0gZnVuY3Rpb24ocXJjb2RlKSB7XG5cbiAgICAgIHZhciBtb2R1bGVDb3VudCA9IHFyY29kZS5nZXRNb2R1bGVDb3VudCgpO1xuXG4gICAgICB2YXIgbG9zdFBvaW50ID0gMDtcblxuICAgICAgLy8gTEVWRUwxXG5cbiAgICAgIGZvciAodmFyIHJvdyA9IDA7IHJvdyA8IG1vZHVsZUNvdW50OyByb3cgKz0gMSkge1xuICAgICAgICBmb3IgKHZhciBjb2wgPSAwOyBjb2wgPCBtb2R1bGVDb3VudDsgY29sICs9IDEpIHtcblxuICAgICAgICAgIHZhciBzYW1lQ291bnQgPSAwO1xuICAgICAgICAgIHZhciBkYXJrID0gcXJjb2RlLmlzRGFyayhyb3csIGNvbCk7XG5cbiAgICAgICAgICBmb3IgKHZhciByID0gLTE7IHIgPD0gMTsgciArPSAxKSB7XG5cbiAgICAgICAgICAgIGlmIChyb3cgKyByIDwgMCB8fCBtb2R1bGVDb3VudCA8PSByb3cgKyByKSB7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKHZhciBjID0gLTE7IGMgPD0gMTsgYyArPSAxKSB7XG5cbiAgICAgICAgICAgICAgaWYgKGNvbCArIGMgPCAwIHx8IG1vZHVsZUNvdW50IDw9IGNvbCArIGMpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmIChyID09IDAgJiYgYyA9PSAwKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAoZGFyayA9PSBxcmNvZGUuaXNEYXJrKHJvdyArIHIsIGNvbCArIGMpICkge1xuICAgICAgICAgICAgICAgIHNhbWVDb3VudCArPSAxO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHNhbWVDb3VudCA+IDUpIHtcbiAgICAgICAgICAgIGxvc3RQb2ludCArPSAoMyArIHNhbWVDb3VudCAtIDUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gTEVWRUwyXG5cbiAgICAgIGZvciAodmFyIHJvdyA9IDA7IHJvdyA8IG1vZHVsZUNvdW50IC0gMTsgcm93ICs9IDEpIHtcbiAgICAgICAgZm9yICh2YXIgY29sID0gMDsgY29sIDwgbW9kdWxlQ291bnQgLSAxOyBjb2wgKz0gMSkge1xuICAgICAgICAgIHZhciBjb3VudCA9IDA7XG4gICAgICAgICAgaWYgKHFyY29kZS5pc0Rhcmsocm93LCBjb2wpICkgY291bnQgKz0gMTtcbiAgICAgICAgICBpZiAocXJjb2RlLmlzRGFyayhyb3cgKyAxLCBjb2wpICkgY291bnQgKz0gMTtcbiAgICAgICAgICBpZiAocXJjb2RlLmlzRGFyayhyb3csIGNvbCArIDEpICkgY291bnQgKz0gMTtcbiAgICAgICAgICBpZiAocXJjb2RlLmlzRGFyayhyb3cgKyAxLCBjb2wgKyAxKSApIGNvdW50ICs9IDE7XG4gICAgICAgICAgaWYgKGNvdW50ID09IDAgfHwgY291bnQgPT0gNCkge1xuICAgICAgICAgICAgbG9zdFBvaW50ICs9IDM7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIExFVkVMM1xuXG4gICAgICBmb3IgKHZhciByb3cgPSAwOyByb3cgPCBtb2R1bGVDb3VudDsgcm93ICs9IDEpIHtcbiAgICAgICAgZm9yICh2YXIgY29sID0gMDsgY29sIDwgbW9kdWxlQ291bnQgLSA2OyBjb2wgKz0gMSkge1xuICAgICAgICAgIGlmIChxcmNvZGUuaXNEYXJrKHJvdywgY29sKVxuICAgICAgICAgICAgICAmJiAhcXJjb2RlLmlzRGFyayhyb3csIGNvbCArIDEpXG4gICAgICAgICAgICAgICYmICBxcmNvZGUuaXNEYXJrKHJvdywgY29sICsgMilcbiAgICAgICAgICAgICAgJiYgIHFyY29kZS5pc0Rhcmsocm93LCBjb2wgKyAzKVxuICAgICAgICAgICAgICAmJiAgcXJjb2RlLmlzRGFyayhyb3csIGNvbCArIDQpXG4gICAgICAgICAgICAgICYmICFxcmNvZGUuaXNEYXJrKHJvdywgY29sICsgNSlcbiAgICAgICAgICAgICAgJiYgIHFyY29kZS5pc0Rhcmsocm93LCBjb2wgKyA2KSApIHtcbiAgICAgICAgICAgIGxvc3RQb2ludCArPSA0MDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIgY29sID0gMDsgY29sIDwgbW9kdWxlQ291bnQ7IGNvbCArPSAxKSB7XG4gICAgICAgIGZvciAodmFyIHJvdyA9IDA7IHJvdyA8IG1vZHVsZUNvdW50IC0gNjsgcm93ICs9IDEpIHtcbiAgICAgICAgICBpZiAocXJjb2RlLmlzRGFyayhyb3csIGNvbClcbiAgICAgICAgICAgICAgJiYgIXFyY29kZS5pc0Rhcmsocm93ICsgMSwgY29sKVxuICAgICAgICAgICAgICAmJiAgcXJjb2RlLmlzRGFyayhyb3cgKyAyLCBjb2wpXG4gICAgICAgICAgICAgICYmICBxcmNvZGUuaXNEYXJrKHJvdyArIDMsIGNvbClcbiAgICAgICAgICAgICAgJiYgIHFyY29kZS5pc0Rhcmsocm93ICsgNCwgY29sKVxuICAgICAgICAgICAgICAmJiAhcXJjb2RlLmlzRGFyayhyb3cgKyA1LCBjb2wpXG4gICAgICAgICAgICAgICYmICBxcmNvZGUuaXNEYXJrKHJvdyArIDYsIGNvbCkgKSB7XG4gICAgICAgICAgICBsb3N0UG9pbnQgKz0gNDA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIExFVkVMNFxuXG4gICAgICB2YXIgZGFya0NvdW50ID0gMDtcblxuICAgICAgZm9yICh2YXIgY29sID0gMDsgY29sIDwgbW9kdWxlQ291bnQ7IGNvbCArPSAxKSB7XG4gICAgICAgIGZvciAodmFyIHJvdyA9IDA7IHJvdyA8IG1vZHVsZUNvdW50OyByb3cgKz0gMSkge1xuICAgICAgICAgIGlmIChxcmNvZGUuaXNEYXJrKHJvdywgY29sKSApIHtcbiAgICAgICAgICAgIGRhcmtDb3VudCArPSAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB2YXIgcmF0aW8gPSBNYXRoLmFicygxMDAgKiBkYXJrQ291bnQgLyBtb2R1bGVDb3VudCAvIG1vZHVsZUNvdW50IC0gNTApIC8gNTtcbiAgICAgIGxvc3RQb2ludCArPSByYXRpbyAqIDEwO1xuXG4gICAgICByZXR1cm4gbG9zdFBvaW50O1xuICAgIH07XG5cbiAgICByZXR1cm4gX3RoaXM7XG4gIH0oKTtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBRUk1hdGhcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICB2YXIgUVJNYXRoID0gZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgRVhQX1RBQkxFID0gbmV3IEFycmF5KDI1Nik7XG4gICAgdmFyIExPR19UQUJMRSA9IG5ldyBBcnJheSgyNTYpO1xuXG4gICAgLy8gaW5pdGlhbGl6ZSB0YWJsZXNcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDg7IGkgKz0gMSkge1xuICAgICAgRVhQX1RBQkxFW2ldID0gMSA8PCBpO1xuICAgIH1cbiAgICBmb3IgKHZhciBpID0gODsgaSA8IDI1NjsgaSArPSAxKSB7XG4gICAgICBFWFBfVEFCTEVbaV0gPSBFWFBfVEFCTEVbaSAtIDRdXG4gICAgICAgIF4gRVhQX1RBQkxFW2kgLSA1XVxuICAgICAgICBeIEVYUF9UQUJMRVtpIC0gNl1cbiAgICAgICAgXiBFWFBfVEFCTEVbaSAtIDhdO1xuICAgIH1cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDI1NTsgaSArPSAxKSB7XG4gICAgICBMT0dfVEFCTEVbRVhQX1RBQkxFW2ldIF0gPSBpO1xuICAgIH1cblxuICAgIHZhciBfdGhpcyA9IHt9O1xuXG4gICAgX3RoaXMuZ2xvZyA9IGZ1bmN0aW9uKG4pIHtcblxuICAgICAgaWYgKG4gPCAxKSB7XG4gICAgICAgIHRocm93ICdnbG9nKCcgKyBuICsgJyknO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gTE9HX1RBQkxFW25dO1xuICAgIH07XG5cbiAgICBfdGhpcy5nZXhwID0gZnVuY3Rpb24obikge1xuXG4gICAgICB3aGlsZSAobiA8IDApIHtcbiAgICAgICAgbiArPSAyNTU7XG4gICAgICB9XG5cbiAgICAgIHdoaWxlIChuID49IDI1Nikge1xuICAgICAgICBuIC09IDI1NTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIEVYUF9UQUJMRVtuXTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIF90aGlzO1xuICB9KCk7XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gcXJQb2x5bm9taWFsXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgZnVuY3Rpb24gcXJQb2x5bm9taWFsKG51bSwgc2hpZnQpIHtcblxuICAgIGlmICh0eXBlb2YgbnVtLmxlbmd0aCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbnVtLmxlbmd0aCArICcvJyArIHNoaWZ0O1xuICAgIH1cblxuICAgIHZhciBfbnVtID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb2Zmc2V0ID0gMDtcbiAgICAgIHdoaWxlIChvZmZzZXQgPCBudW0ubGVuZ3RoICYmIG51bVtvZmZzZXRdID09IDApIHtcbiAgICAgICAgb2Zmc2V0ICs9IDE7XG4gICAgICB9XG4gICAgICB2YXIgX251bSA9IG5ldyBBcnJheShudW0ubGVuZ3RoIC0gb2Zmc2V0ICsgc2hpZnQpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBudW0ubGVuZ3RoIC0gb2Zmc2V0OyBpICs9IDEpIHtcbiAgICAgICAgX251bVtpXSA9IG51bVtpICsgb2Zmc2V0XTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBfbnVtO1xuICAgIH0oKTtcblxuICAgIHZhciBfdGhpcyA9IHt9O1xuXG4gICAgX3RoaXMuZ2V0QXQgPSBmdW5jdGlvbihpbmRleCkge1xuICAgICAgcmV0dXJuIF9udW1baW5kZXhdO1xuICAgIH07XG5cbiAgICBfdGhpcy5nZXRMZW5ndGggPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBfbnVtLmxlbmd0aDtcbiAgICB9O1xuXG4gICAgX3RoaXMubXVsdGlwbHkgPSBmdW5jdGlvbihlKSB7XG5cbiAgICAgIHZhciBudW0gPSBuZXcgQXJyYXkoX3RoaXMuZ2V0TGVuZ3RoKCkgKyBlLmdldExlbmd0aCgpIC0gMSk7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgX3RoaXMuZ2V0TGVuZ3RoKCk7IGkgKz0gMSkge1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGUuZ2V0TGVuZ3RoKCk7IGogKz0gMSkge1xuICAgICAgICAgIG51bVtpICsgal0gXj0gUVJNYXRoLmdleHAoUVJNYXRoLmdsb2coX3RoaXMuZ2V0QXQoaSkgKSArIFFSTWF0aC5nbG9nKGUuZ2V0QXQoaikgKSApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBxclBvbHlub21pYWwobnVtLCAwKTtcbiAgICB9O1xuXG4gICAgX3RoaXMubW9kID0gZnVuY3Rpb24oZSkge1xuXG4gICAgICBpZiAoX3RoaXMuZ2V0TGVuZ3RoKCkgLSBlLmdldExlbmd0aCgpIDwgMCkge1xuICAgICAgICByZXR1cm4gX3RoaXM7XG4gICAgICB9XG5cbiAgICAgIHZhciByYXRpbyA9IFFSTWF0aC5nbG9nKF90aGlzLmdldEF0KDApICkgLSBRUk1hdGguZ2xvZyhlLmdldEF0KDApICk7XG5cbiAgICAgIHZhciBudW0gPSBuZXcgQXJyYXkoX3RoaXMuZ2V0TGVuZ3RoKCkgKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgX3RoaXMuZ2V0TGVuZ3RoKCk7IGkgKz0gMSkge1xuICAgICAgICBudW1baV0gPSBfdGhpcy5nZXRBdChpKTtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlLmdldExlbmd0aCgpOyBpICs9IDEpIHtcbiAgICAgICAgbnVtW2ldIF49IFFSTWF0aC5nZXhwKFFSTWF0aC5nbG9nKGUuZ2V0QXQoaSkgKSArIHJhdGlvKTtcbiAgICAgIH1cblxuICAgICAgLy8gcmVjdXJzaXZlIGNhbGxcbiAgICAgIHJldHVybiBxclBvbHlub21pYWwobnVtLCAwKS5tb2QoZSk7XG4gICAgfTtcblxuICAgIHJldHVybiBfdGhpcztcbiAgfTtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBRUlJTQmxvY2tcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICB2YXIgUVJSU0Jsb2NrID0gZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgUlNfQkxPQ0tfVEFCTEUgPSBbXG5cbiAgICAgIC8vIExcbiAgICAgIC8vIE1cbiAgICAgIC8vIFFcbiAgICAgIC8vIEhcblxuICAgICAgLy8gMVxuICAgICAgWzEsIDI2LCAxOV0sXG4gICAgICBbMSwgMjYsIDE2XSxcbiAgICAgIFsxLCAyNiwgMTNdLFxuICAgICAgWzEsIDI2LCA5XSxcblxuICAgICAgLy8gMlxuICAgICAgWzEsIDQ0LCAzNF0sXG4gICAgICBbMSwgNDQsIDI4XSxcbiAgICAgIFsxLCA0NCwgMjJdLFxuICAgICAgWzEsIDQ0LCAxNl0sXG5cbiAgICAgIC8vIDNcbiAgICAgIFsxLCA3MCwgNTVdLFxuICAgICAgWzEsIDcwLCA0NF0sXG4gICAgICBbMiwgMzUsIDE3XSxcbiAgICAgIFsyLCAzNSwgMTNdLFxuXG4gICAgICAvLyA0XG4gICAgICBbMSwgMTAwLCA4MF0sXG4gICAgICBbMiwgNTAsIDMyXSxcbiAgICAgIFsyLCA1MCwgMjRdLFxuICAgICAgWzQsIDI1LCA5XSxcblxuICAgICAgLy8gNVxuICAgICAgWzEsIDEzNCwgMTA4XSxcbiAgICAgIFsyLCA2NywgNDNdLFxuICAgICAgWzIsIDMzLCAxNSwgMiwgMzQsIDE2XSxcbiAgICAgIFsyLCAzMywgMTEsIDIsIDM0LCAxMl0sXG5cbiAgICAgIC8vIDZcbiAgICAgIFsyLCA4NiwgNjhdLFxuICAgICAgWzQsIDQzLCAyN10sXG4gICAgICBbNCwgNDMsIDE5XSxcbiAgICAgIFs0LCA0MywgMTVdLFxuXG4gICAgICAvLyA3XG4gICAgICBbMiwgOTgsIDc4XSxcbiAgICAgIFs0LCA0OSwgMzFdLFxuICAgICAgWzIsIDMyLCAxNCwgNCwgMzMsIDE1XSxcbiAgICAgIFs0LCAzOSwgMTMsIDEsIDQwLCAxNF0sXG5cbiAgICAgIC8vIDhcbiAgICAgIFsyLCAxMjEsIDk3XSxcbiAgICAgIFsyLCA2MCwgMzgsIDIsIDYxLCAzOV0sXG4gICAgICBbNCwgNDAsIDE4LCAyLCA0MSwgMTldLFxuICAgICAgWzQsIDQwLCAxNCwgMiwgNDEsIDE1XSxcblxuICAgICAgLy8gOVxuICAgICAgWzIsIDE0NiwgMTE2XSxcbiAgICAgIFszLCA1OCwgMzYsIDIsIDU5LCAzN10sXG4gICAgICBbNCwgMzYsIDE2LCA0LCAzNywgMTddLFxuICAgICAgWzQsIDM2LCAxMiwgNCwgMzcsIDEzXSxcblxuICAgICAgLy8gMTBcbiAgICAgIFsyLCA4NiwgNjgsIDIsIDg3LCA2OV0sXG4gICAgICBbNCwgNjksIDQzLCAxLCA3MCwgNDRdLFxuICAgICAgWzYsIDQzLCAxOSwgMiwgNDQsIDIwXSxcbiAgICAgIFs2LCA0MywgMTUsIDIsIDQ0LCAxNl0sXG5cbiAgICAgIC8vIDExXG4gICAgICBbNCwgMTAxLCA4MV0sXG4gICAgICBbMSwgODAsIDUwLCA0LCA4MSwgNTFdLFxuICAgICAgWzQsIDUwLCAyMiwgNCwgNTEsIDIzXSxcbiAgICAgIFszLCAzNiwgMTIsIDgsIDM3LCAxM10sXG5cbiAgICAgIC8vIDEyXG4gICAgICBbMiwgMTE2LCA5MiwgMiwgMTE3LCA5M10sXG4gICAgICBbNiwgNTgsIDM2LCAyLCA1OSwgMzddLFxuICAgICAgWzQsIDQ2LCAyMCwgNiwgNDcsIDIxXSxcbiAgICAgIFs3LCA0MiwgMTQsIDQsIDQzLCAxNV0sXG5cbiAgICAgIC8vIDEzXG4gICAgICBbNCwgMTMzLCAxMDddLFxuICAgICAgWzgsIDU5LCAzNywgMSwgNjAsIDM4XSxcbiAgICAgIFs4LCA0NCwgMjAsIDQsIDQ1LCAyMV0sXG4gICAgICBbMTIsIDMzLCAxMSwgNCwgMzQsIDEyXSxcblxuICAgICAgLy8gMTRcbiAgICAgIFszLCAxNDUsIDExNSwgMSwgMTQ2LCAxMTZdLFxuICAgICAgWzQsIDY0LCA0MCwgNSwgNjUsIDQxXSxcbiAgICAgIFsxMSwgMzYsIDE2LCA1LCAzNywgMTddLFxuICAgICAgWzExLCAzNiwgMTIsIDUsIDM3LCAxM10sXG5cbiAgICAgIC8vIDE1XG4gICAgICBbNSwgMTA5LCA4NywgMSwgMTEwLCA4OF0sXG4gICAgICBbNSwgNjUsIDQxLCA1LCA2NiwgNDJdLFxuICAgICAgWzUsIDU0LCAyNCwgNywgNTUsIDI1XSxcbiAgICAgIFsxMSwgMzYsIDEyLCA3LCAzNywgMTNdLFxuXG4gICAgICAvLyAxNlxuICAgICAgWzUsIDEyMiwgOTgsIDEsIDEyMywgOTldLFxuICAgICAgWzcsIDczLCA0NSwgMywgNzQsIDQ2XSxcbiAgICAgIFsxNSwgNDMsIDE5LCAyLCA0NCwgMjBdLFxuICAgICAgWzMsIDQ1LCAxNSwgMTMsIDQ2LCAxNl0sXG5cbiAgICAgIC8vIDE3XG4gICAgICBbMSwgMTM1LCAxMDcsIDUsIDEzNiwgMTA4XSxcbiAgICAgIFsxMCwgNzQsIDQ2LCAxLCA3NSwgNDddLFxuICAgICAgWzEsIDUwLCAyMiwgMTUsIDUxLCAyM10sXG4gICAgICBbMiwgNDIsIDE0LCAxNywgNDMsIDE1XSxcblxuICAgICAgLy8gMThcbiAgICAgIFs1LCAxNTAsIDEyMCwgMSwgMTUxLCAxMjFdLFxuICAgICAgWzksIDY5LCA0MywgNCwgNzAsIDQ0XSxcbiAgICAgIFsxNywgNTAsIDIyLCAxLCA1MSwgMjNdLFxuICAgICAgWzIsIDQyLCAxNCwgMTksIDQzLCAxNV0sXG5cbiAgICAgIC8vIDE5XG4gICAgICBbMywgMTQxLCAxMTMsIDQsIDE0MiwgMTE0XSxcbiAgICAgIFszLCA3MCwgNDQsIDExLCA3MSwgNDVdLFxuICAgICAgWzE3LCA0NywgMjEsIDQsIDQ4LCAyMl0sXG4gICAgICBbOSwgMzksIDEzLCAxNiwgNDAsIDE0XSxcblxuICAgICAgLy8gMjBcbiAgICAgIFszLCAxMzUsIDEwNywgNSwgMTM2LCAxMDhdLFxuICAgICAgWzMsIDY3LCA0MSwgMTMsIDY4LCA0Ml0sXG4gICAgICBbMTUsIDU0LCAyNCwgNSwgNTUsIDI1XSxcbiAgICAgIFsxNSwgNDMsIDE1LCAxMCwgNDQsIDE2XSxcblxuICAgICAgLy8gMjFcbiAgICAgIFs0LCAxNDQsIDExNiwgNCwgMTQ1LCAxMTddLFxuICAgICAgWzE3LCA2OCwgNDJdLFxuICAgICAgWzE3LCA1MCwgMjIsIDYsIDUxLCAyM10sXG4gICAgICBbMTksIDQ2LCAxNiwgNiwgNDcsIDE3XSxcblxuICAgICAgLy8gMjJcbiAgICAgIFsyLCAxMzksIDExMSwgNywgMTQwLCAxMTJdLFxuICAgICAgWzE3LCA3NCwgNDZdLFxuICAgICAgWzcsIDU0LCAyNCwgMTYsIDU1LCAyNV0sXG4gICAgICBbMzQsIDM3LCAxM10sXG5cbiAgICAgIC8vIDIzXG4gICAgICBbNCwgMTUxLCAxMjEsIDUsIDE1MiwgMTIyXSxcbiAgICAgIFs0LCA3NSwgNDcsIDE0LCA3NiwgNDhdLFxuICAgICAgWzExLCA1NCwgMjQsIDE0LCA1NSwgMjVdLFxuICAgICAgWzE2LCA0NSwgMTUsIDE0LCA0NiwgMTZdLFxuXG4gICAgICAvLyAyNFxuICAgICAgWzYsIDE0NywgMTE3LCA0LCAxNDgsIDExOF0sXG4gICAgICBbNiwgNzMsIDQ1LCAxNCwgNzQsIDQ2XSxcbiAgICAgIFsxMSwgNTQsIDI0LCAxNiwgNTUsIDI1XSxcbiAgICAgIFszMCwgNDYsIDE2LCAyLCA0NywgMTddLFxuXG4gICAgICAvLyAyNVxuICAgICAgWzgsIDEzMiwgMTA2LCA0LCAxMzMsIDEwN10sXG4gICAgICBbOCwgNzUsIDQ3LCAxMywgNzYsIDQ4XSxcbiAgICAgIFs3LCA1NCwgMjQsIDIyLCA1NSwgMjVdLFxuICAgICAgWzIyLCA0NSwgMTUsIDEzLCA0NiwgMTZdLFxuXG4gICAgICAvLyAyNlxuICAgICAgWzEwLCAxNDIsIDExNCwgMiwgMTQzLCAxMTVdLFxuICAgICAgWzE5LCA3NCwgNDYsIDQsIDc1LCA0N10sXG4gICAgICBbMjgsIDUwLCAyMiwgNiwgNTEsIDIzXSxcbiAgICAgIFszMywgNDYsIDE2LCA0LCA0NywgMTddLFxuXG4gICAgICAvLyAyN1xuICAgICAgWzgsIDE1MiwgMTIyLCA0LCAxNTMsIDEyM10sXG4gICAgICBbMjIsIDczLCA0NSwgMywgNzQsIDQ2XSxcbiAgICAgIFs4LCA1MywgMjMsIDI2LCA1NCwgMjRdLFxuICAgICAgWzEyLCA0NSwgMTUsIDI4LCA0NiwgMTZdLFxuXG4gICAgICAvLyAyOFxuICAgICAgWzMsIDE0NywgMTE3LCAxMCwgMTQ4LCAxMThdLFxuICAgICAgWzMsIDczLCA0NSwgMjMsIDc0LCA0Nl0sXG4gICAgICBbNCwgNTQsIDI0LCAzMSwgNTUsIDI1XSxcbiAgICAgIFsxMSwgNDUsIDE1LCAzMSwgNDYsIDE2XSxcblxuICAgICAgLy8gMjlcbiAgICAgIFs3LCAxNDYsIDExNiwgNywgMTQ3LCAxMTddLFxuICAgICAgWzIxLCA3MywgNDUsIDcsIDc0LCA0Nl0sXG4gICAgICBbMSwgNTMsIDIzLCAzNywgNTQsIDI0XSxcbiAgICAgIFsxOSwgNDUsIDE1LCAyNiwgNDYsIDE2XSxcblxuICAgICAgLy8gMzBcbiAgICAgIFs1LCAxNDUsIDExNSwgMTAsIDE0NiwgMTE2XSxcbiAgICAgIFsxOSwgNzUsIDQ3LCAxMCwgNzYsIDQ4XSxcbiAgICAgIFsxNSwgNTQsIDI0LCAyNSwgNTUsIDI1XSxcbiAgICAgIFsyMywgNDUsIDE1LCAyNSwgNDYsIDE2XSxcblxuICAgICAgLy8gMzFcbiAgICAgIFsxMywgMTQ1LCAxMTUsIDMsIDE0NiwgMTE2XSxcbiAgICAgIFsyLCA3NCwgNDYsIDI5LCA3NSwgNDddLFxuICAgICAgWzQyLCA1NCwgMjQsIDEsIDU1LCAyNV0sXG4gICAgICBbMjMsIDQ1LCAxNSwgMjgsIDQ2LCAxNl0sXG5cbiAgICAgIC8vIDMyXG4gICAgICBbMTcsIDE0NSwgMTE1XSxcbiAgICAgIFsxMCwgNzQsIDQ2LCAyMywgNzUsIDQ3XSxcbiAgICAgIFsxMCwgNTQsIDI0LCAzNSwgNTUsIDI1XSxcbiAgICAgIFsxOSwgNDUsIDE1LCAzNSwgNDYsIDE2XSxcblxuICAgICAgLy8gMzNcbiAgICAgIFsxNywgMTQ1LCAxMTUsIDEsIDE0NiwgMTE2XSxcbiAgICAgIFsxNCwgNzQsIDQ2LCAyMSwgNzUsIDQ3XSxcbiAgICAgIFsyOSwgNTQsIDI0LCAxOSwgNTUsIDI1XSxcbiAgICAgIFsxMSwgNDUsIDE1LCA0NiwgNDYsIDE2XSxcblxuICAgICAgLy8gMzRcbiAgICAgIFsxMywgMTQ1LCAxMTUsIDYsIDE0NiwgMTE2XSxcbiAgICAgIFsxNCwgNzQsIDQ2LCAyMywgNzUsIDQ3XSxcbiAgICAgIFs0NCwgNTQsIDI0LCA3LCA1NSwgMjVdLFxuICAgICAgWzU5LCA0NiwgMTYsIDEsIDQ3LCAxN10sXG5cbiAgICAgIC8vIDM1XG4gICAgICBbMTIsIDE1MSwgMTIxLCA3LCAxNTIsIDEyMl0sXG4gICAgICBbMTIsIDc1LCA0NywgMjYsIDc2LCA0OF0sXG4gICAgICBbMzksIDU0LCAyNCwgMTQsIDU1LCAyNV0sXG4gICAgICBbMjIsIDQ1LCAxNSwgNDEsIDQ2LCAxNl0sXG5cbiAgICAgIC8vIDM2XG4gICAgICBbNiwgMTUxLCAxMjEsIDE0LCAxNTIsIDEyMl0sXG4gICAgICBbNiwgNzUsIDQ3LCAzNCwgNzYsIDQ4XSxcbiAgICAgIFs0NiwgNTQsIDI0LCAxMCwgNTUsIDI1XSxcbiAgICAgIFsyLCA0NSwgMTUsIDY0LCA0NiwgMTZdLFxuXG4gICAgICAvLyAzN1xuICAgICAgWzE3LCAxNTIsIDEyMiwgNCwgMTUzLCAxMjNdLFxuICAgICAgWzI5LCA3NCwgNDYsIDE0LCA3NSwgNDddLFxuICAgICAgWzQ5LCA1NCwgMjQsIDEwLCA1NSwgMjVdLFxuICAgICAgWzI0LCA0NSwgMTUsIDQ2LCA0NiwgMTZdLFxuXG4gICAgICAvLyAzOFxuICAgICAgWzQsIDE1MiwgMTIyLCAxOCwgMTUzLCAxMjNdLFxuICAgICAgWzEzLCA3NCwgNDYsIDMyLCA3NSwgNDddLFxuICAgICAgWzQ4LCA1NCwgMjQsIDE0LCA1NSwgMjVdLFxuICAgICAgWzQyLCA0NSwgMTUsIDMyLCA0NiwgMTZdLFxuXG4gICAgICAvLyAzOVxuICAgICAgWzIwLCAxNDcsIDExNywgNCwgMTQ4LCAxMThdLFxuICAgICAgWzQwLCA3NSwgNDcsIDcsIDc2LCA0OF0sXG4gICAgICBbNDMsIDU0LCAyNCwgMjIsIDU1LCAyNV0sXG4gICAgICBbMTAsIDQ1LCAxNSwgNjcsIDQ2LCAxNl0sXG5cbiAgICAgIC8vIDQwXG4gICAgICBbMTksIDE0OCwgMTE4LCA2LCAxNDksIDExOV0sXG4gICAgICBbMTgsIDc1LCA0NywgMzEsIDc2LCA0OF0sXG4gICAgICBbMzQsIDU0LCAyNCwgMzQsIDU1LCAyNV0sXG4gICAgICBbMjAsIDQ1LCAxNSwgNjEsIDQ2LCAxNl1cbiAgICBdO1xuXG4gICAgdmFyIHFyUlNCbG9jayA9IGZ1bmN0aW9uKHRvdGFsQ291bnQsIGRhdGFDb3VudCkge1xuICAgICAgdmFyIF90aGlzID0ge307XG4gICAgICBfdGhpcy50b3RhbENvdW50ID0gdG90YWxDb3VudDtcbiAgICAgIF90aGlzLmRhdGFDb3VudCA9IGRhdGFDb3VudDtcbiAgICAgIHJldHVybiBfdGhpcztcbiAgICB9O1xuXG4gICAgdmFyIF90aGlzID0ge307XG5cbiAgICB2YXIgZ2V0UnNCbG9ja1RhYmxlID0gZnVuY3Rpb24odHlwZU51bWJlciwgZXJyb3JDb3JyZWN0aW9uTGV2ZWwpIHtcblxuICAgICAgc3dpdGNoKGVycm9yQ29ycmVjdGlvbkxldmVsKSB7XG4gICAgICBjYXNlIFFSRXJyb3JDb3JyZWN0aW9uTGV2ZWwuTCA6XG4gICAgICAgIHJldHVybiBSU19CTE9DS19UQUJMRVsodHlwZU51bWJlciAtIDEpICogNCArIDBdO1xuICAgICAgY2FzZSBRUkVycm9yQ29ycmVjdGlvbkxldmVsLk0gOlxuICAgICAgICByZXR1cm4gUlNfQkxPQ0tfVEFCTEVbKHR5cGVOdW1iZXIgLSAxKSAqIDQgKyAxXTtcbiAgICAgIGNhc2UgUVJFcnJvckNvcnJlY3Rpb25MZXZlbC5RIDpcbiAgICAgICAgcmV0dXJuIFJTX0JMT0NLX1RBQkxFWyh0eXBlTnVtYmVyIC0gMSkgKiA0ICsgMl07XG4gICAgICBjYXNlIFFSRXJyb3JDb3JyZWN0aW9uTGV2ZWwuSCA6XG4gICAgICAgIHJldHVybiBSU19CTE9DS19UQUJMRVsodHlwZU51bWJlciAtIDEpICogNCArIDNdO1xuICAgICAgZGVmYXVsdCA6XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgfTtcblxuICAgIF90aGlzLmdldFJTQmxvY2tzID0gZnVuY3Rpb24odHlwZU51bWJlciwgZXJyb3JDb3JyZWN0aW9uTGV2ZWwpIHtcblxuICAgICAgdmFyIHJzQmxvY2sgPSBnZXRSc0Jsb2NrVGFibGUodHlwZU51bWJlciwgZXJyb3JDb3JyZWN0aW9uTGV2ZWwpO1xuXG4gICAgICBpZiAodHlwZW9mIHJzQmxvY2sgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgdGhyb3cgJ2JhZCBycyBibG9jayBAIHR5cGVOdW1iZXI6JyArIHR5cGVOdW1iZXIgK1xuICAgICAgICAgICAgJy9lcnJvckNvcnJlY3Rpb25MZXZlbDonICsgZXJyb3JDb3JyZWN0aW9uTGV2ZWw7XG4gICAgICB9XG5cbiAgICAgIHZhciBsZW5ndGggPSByc0Jsb2NrLmxlbmd0aCAvIDM7XG5cbiAgICAgIHZhciBsaXN0ID0gW107XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcblxuICAgICAgICB2YXIgY291bnQgPSByc0Jsb2NrW2kgKiAzICsgMF07XG4gICAgICAgIHZhciB0b3RhbENvdW50ID0gcnNCbG9ja1tpICogMyArIDFdO1xuICAgICAgICB2YXIgZGF0YUNvdW50ID0gcnNCbG9ja1tpICogMyArIDJdO1xuXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY291bnQ7IGogKz0gMSkge1xuICAgICAgICAgIGxpc3QucHVzaChxclJTQmxvY2sodG90YWxDb3VudCwgZGF0YUNvdW50KSApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBsaXN0O1xuICAgIH07XG5cbiAgICByZXR1cm4gX3RoaXM7XG4gIH0oKTtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBxckJpdEJ1ZmZlclxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHZhciBxckJpdEJ1ZmZlciA9IGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIF9idWZmZXIgPSBbXTtcbiAgICB2YXIgX2xlbmd0aCA9IDA7XG5cbiAgICB2YXIgX3RoaXMgPSB7fTtcblxuICAgIF90aGlzLmdldEJ1ZmZlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIF9idWZmZXI7XG4gICAgfTtcblxuICAgIF90aGlzLmdldEF0ID0gZnVuY3Rpb24oaW5kZXgpIHtcbiAgICAgIHZhciBidWZJbmRleCA9IE1hdGguZmxvb3IoaW5kZXggLyA4KTtcbiAgICAgIHJldHVybiAoIChfYnVmZmVyW2J1ZkluZGV4XSA+Pj4gKDcgLSBpbmRleCAlIDgpICkgJiAxKSA9PSAxO1xuICAgIH07XG5cbiAgICBfdGhpcy5wdXQgPSBmdW5jdGlvbihudW0sIGxlbmd0aCkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBfdGhpcy5wdXRCaXQoICggKG51bSA+Pj4gKGxlbmd0aCAtIGkgLSAxKSApICYgMSkgPT0gMSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIF90aGlzLmdldExlbmd0aEluQml0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIF9sZW5ndGg7XG4gICAgfTtcblxuICAgIF90aGlzLnB1dEJpdCA9IGZ1bmN0aW9uKGJpdCkge1xuXG4gICAgICB2YXIgYnVmSW5kZXggPSBNYXRoLmZsb29yKF9sZW5ndGggLyA4KTtcbiAgICAgIGlmIChfYnVmZmVyLmxlbmd0aCA8PSBidWZJbmRleCkge1xuICAgICAgICBfYnVmZmVyLnB1c2goMCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChiaXQpIHtcbiAgICAgICAgX2J1ZmZlcltidWZJbmRleF0gfD0gKDB4ODAgPj4+IChfbGVuZ3RoICUgOCkgKTtcbiAgICAgIH1cblxuICAgICAgX2xlbmd0aCArPSAxO1xuICAgIH07XG5cbiAgICByZXR1cm4gX3RoaXM7XG4gIH07XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gcXJOdW1iZXJcbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICB2YXIgcXJOdW1iZXIgPSBmdW5jdGlvbihkYXRhKSB7XG5cbiAgICB2YXIgX21vZGUgPSBRUk1vZGUuTU9ERV9OVU1CRVI7XG4gICAgdmFyIF9kYXRhID0gZGF0YTtcblxuICAgIHZhciBfdGhpcyA9IHt9O1xuXG4gICAgX3RoaXMuZ2V0TW9kZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIF9tb2RlO1xuICAgIH07XG5cbiAgICBfdGhpcy5nZXRMZW5ndGggPSBmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgIHJldHVybiBfZGF0YS5sZW5ndGg7XG4gICAgfTtcblxuICAgIF90aGlzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyKSB7XG5cbiAgICAgIHZhciBkYXRhID0gX2RhdGE7XG5cbiAgICAgIHZhciBpID0gMDtcblxuICAgICAgd2hpbGUgKGkgKyAyIDwgZGF0YS5sZW5ndGgpIHtcbiAgICAgICAgYnVmZmVyLnB1dChzdHJUb051bShkYXRhLnN1YnN0cmluZyhpLCBpICsgMykgKSwgMTApO1xuICAgICAgICBpICs9IDM7XG4gICAgICB9XG5cbiAgICAgIGlmIChpIDwgZGF0YS5sZW5ndGgpIHtcbiAgICAgICAgaWYgKGRhdGEubGVuZ3RoIC0gaSA9PSAxKSB7XG4gICAgICAgICAgYnVmZmVyLnB1dChzdHJUb051bShkYXRhLnN1YnN0cmluZyhpLCBpICsgMSkgKSwgNCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZGF0YS5sZW5ndGggLSBpID09IDIpIHtcbiAgICAgICAgICBidWZmZXIucHV0KHN0clRvTnVtKGRhdGEuc3Vic3RyaW5nKGksIGkgKyAyKSApLCA3KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgc3RyVG9OdW0gPSBmdW5jdGlvbihzKSB7XG4gICAgICB2YXIgbnVtID0gMDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBudW0gPSBudW0gKiAxMCArIGNoYXRUb051bShzLmNoYXJBdChpKSApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG51bTtcbiAgICB9O1xuXG4gICAgdmFyIGNoYXRUb051bSA9IGZ1bmN0aW9uKGMpIHtcbiAgICAgIGlmICgnMCcgPD0gYyAmJiBjIDw9ICc5Jykge1xuICAgICAgICByZXR1cm4gYy5jaGFyQ29kZUF0KDApIC0gJzAnLmNoYXJDb2RlQXQoMCk7XG4gICAgICB9XG4gICAgICB0aHJvdyAnaWxsZWdhbCBjaGFyIDonICsgYztcbiAgICB9O1xuXG4gICAgcmV0dXJuIF90aGlzO1xuICB9O1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIHFyQWxwaGFOdW1cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICB2YXIgcXJBbHBoYU51bSA9IGZ1bmN0aW9uKGRhdGEpIHtcblxuICAgIHZhciBfbW9kZSA9IFFSTW9kZS5NT0RFX0FMUEhBX05VTTtcbiAgICB2YXIgX2RhdGEgPSBkYXRhO1xuXG4gICAgdmFyIF90aGlzID0ge307XG5cbiAgICBfdGhpcy5nZXRNb2RlID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gX21vZGU7XG4gICAgfTtcblxuICAgIF90aGlzLmdldExlbmd0aCA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgcmV0dXJuIF9kYXRhLmxlbmd0aDtcbiAgICB9O1xuXG4gICAgX3RoaXMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIpIHtcblxuICAgICAgdmFyIHMgPSBfZGF0YTtcblxuICAgICAgdmFyIGkgPSAwO1xuXG4gICAgICB3aGlsZSAoaSArIDEgPCBzLmxlbmd0aCkge1xuICAgICAgICBidWZmZXIucHV0KFxuICAgICAgICAgIGdldENvZGUocy5jaGFyQXQoaSkgKSAqIDQ1ICtcbiAgICAgICAgICBnZXRDb2RlKHMuY2hhckF0KGkgKyAxKSApLCAxMSk7XG4gICAgICAgIGkgKz0gMjtcbiAgICAgIH1cblxuICAgICAgaWYgKGkgPCBzLmxlbmd0aCkge1xuICAgICAgICBidWZmZXIucHV0KGdldENvZGUocy5jaGFyQXQoaSkgKSwgNik7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHZhciBnZXRDb2RlID0gZnVuY3Rpb24oYykge1xuXG4gICAgICBpZiAoJzAnIDw9IGMgJiYgYyA8PSAnOScpIHtcbiAgICAgICAgcmV0dXJuIGMuY2hhckNvZGVBdCgwKSAtICcwJy5jaGFyQ29kZUF0KDApO1xuICAgICAgfSBlbHNlIGlmICgnQScgPD0gYyAmJiBjIDw9ICdaJykge1xuICAgICAgICByZXR1cm4gYy5jaGFyQ29kZUF0KDApIC0gJ0EnLmNoYXJDb2RlQXQoMCkgKyAxMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN3aXRjaCAoYykge1xuICAgICAgICBjYXNlICcgJyA6IHJldHVybiAzNjtcbiAgICAgICAgY2FzZSAnJCcgOiByZXR1cm4gMzc7XG4gICAgICAgIGNhc2UgJyUnIDogcmV0dXJuIDM4O1xuICAgICAgICBjYXNlICcqJyA6IHJldHVybiAzOTtcbiAgICAgICAgY2FzZSAnKycgOiByZXR1cm4gNDA7XG4gICAgICAgIGNhc2UgJy0nIDogcmV0dXJuIDQxO1xuICAgICAgICBjYXNlICcuJyA6IHJldHVybiA0MjtcbiAgICAgICAgY2FzZSAnLycgOiByZXR1cm4gNDM7XG4gICAgICAgIGNhc2UgJzonIDogcmV0dXJuIDQ0O1xuICAgICAgICBkZWZhdWx0IDpcbiAgICAgICAgICB0aHJvdyAnaWxsZWdhbCBjaGFyIDonICsgYztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gX3RoaXM7XG4gIH07XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gcXI4Qml0Qnl0ZVxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHZhciBxcjhCaXRCeXRlID0gZnVuY3Rpb24oZGF0YSkge1xuXG4gICAgdmFyIF9tb2RlID0gUVJNb2RlLk1PREVfOEJJVF9CWVRFO1xuICAgIHZhciBfZGF0YSA9IGRhdGE7XG4gICAgdmFyIF9ieXRlcyA9IHFyY29kZS5zdHJpbmdUb0J5dGVzKGRhdGEpO1xuXG4gICAgdmFyIF90aGlzID0ge307XG5cbiAgICBfdGhpcy5nZXRNb2RlID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gX21vZGU7XG4gICAgfTtcblxuICAgIF90aGlzLmdldExlbmd0aCA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgcmV0dXJuIF9ieXRlcy5sZW5ndGg7XG4gICAgfTtcblxuICAgIF90aGlzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IF9ieXRlcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBidWZmZXIucHV0KF9ieXRlc1tpXSwgOCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBfdGhpcztcbiAgfTtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBxckthbmppXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgdmFyIHFyS2FuamkgPSBmdW5jdGlvbihkYXRhKSB7XG5cbiAgICB2YXIgX21vZGUgPSBRUk1vZGUuTU9ERV9LQU5KSTtcbiAgICB2YXIgX2RhdGEgPSBkYXRhO1xuXG4gICAgdmFyIHN0cmluZ1RvQnl0ZXMgPSBxcmNvZGUuc3RyaW5nVG9CeXRlc0Z1bmNzWydTSklTJ107XG4gICAgaWYgKCFzdHJpbmdUb0J5dGVzKSB7XG4gICAgICB0aHJvdyAnc2ppcyBub3Qgc3VwcG9ydGVkLic7XG4gICAgfVxuICAgICFmdW5jdGlvbihjLCBjb2RlKSB7XG4gICAgICAvLyBzZWxmIHRlc3QgZm9yIHNqaXMgc3VwcG9ydC5cbiAgICAgIHZhciB0ZXN0ID0gc3RyaW5nVG9CeXRlcyhjKTtcbiAgICAgIGlmICh0ZXN0Lmxlbmd0aCAhPSAyIHx8ICggKHRlc3RbMF0gPDwgOCkgfCB0ZXN0WzFdKSAhPSBjb2RlKSB7XG4gICAgICAgIHRocm93ICdzamlzIG5vdCBzdXBwb3J0ZWQuJztcbiAgICAgIH1cbiAgICB9KCdcXHU1M2NiJywgMHg5NzQ2KTtcblxuICAgIHZhciBfYnl0ZXMgPSBzdHJpbmdUb0J5dGVzKGRhdGEpO1xuXG4gICAgdmFyIF90aGlzID0ge307XG5cbiAgICBfdGhpcy5nZXRNb2RlID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gX21vZGU7XG4gICAgfTtcblxuICAgIF90aGlzLmdldExlbmd0aCA9IGZ1bmN0aW9uKGJ1ZmZlcikge1xuICAgICAgcmV0dXJuIH5+KF9ieXRlcy5sZW5ndGggLyAyKTtcbiAgICB9O1xuXG4gICAgX3RoaXMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIpIHtcblxuICAgICAgdmFyIGRhdGEgPSBfYnl0ZXM7XG5cbiAgICAgIHZhciBpID0gMDtcblxuICAgICAgd2hpbGUgKGkgKyAxIDwgZGF0YS5sZW5ndGgpIHtcblxuICAgICAgICB2YXIgYyA9ICggKDB4ZmYgJiBkYXRhW2ldKSA8PCA4KSB8ICgweGZmICYgZGF0YVtpICsgMV0pO1xuXG4gICAgICAgIGlmICgweDgxNDAgPD0gYyAmJiBjIDw9IDB4OUZGQykge1xuICAgICAgICAgIGMgLT0gMHg4MTQwO1xuICAgICAgICB9IGVsc2UgaWYgKDB4RTA0MCA8PSBjICYmIGMgPD0gMHhFQkJGKSB7XG4gICAgICAgICAgYyAtPSAweEMxNDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgJ2lsbGVnYWwgY2hhciBhdCAnICsgKGkgKyAxKSArICcvJyArIGM7XG4gICAgICAgIH1cblxuICAgICAgICBjID0gKCAoYyA+Pj4gOCkgJiAweGZmKSAqIDB4QzAgKyAoYyAmIDB4ZmYpO1xuXG4gICAgICAgIGJ1ZmZlci5wdXQoYywgMTMpO1xuXG4gICAgICAgIGkgKz0gMjtcbiAgICAgIH1cblxuICAgICAgaWYgKGkgPCBkYXRhLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyAnaWxsZWdhbCBjaGFyIGF0ICcgKyAoaSArIDEpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gX3RoaXM7XG4gIH07XG5cbiAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy8gR0lGIFN1cHBvcnQgZXRjLlxuICAvL1xuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gIC8vIGJ5dGVBcnJheU91dHB1dFN0cmVhbVxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHZhciBieXRlQXJyYXlPdXRwdXRTdHJlYW0gPSBmdW5jdGlvbigpIHtcblxuICAgIHZhciBfYnl0ZXMgPSBbXTtcblxuICAgIHZhciBfdGhpcyA9IHt9O1xuXG4gICAgX3RoaXMud3JpdGVCeXRlID0gZnVuY3Rpb24oYikge1xuICAgICAgX2J5dGVzLnB1c2goYiAmIDB4ZmYpO1xuICAgIH07XG5cbiAgICBfdGhpcy53cml0ZVNob3J0ID0gZnVuY3Rpb24oaSkge1xuICAgICAgX3RoaXMud3JpdGVCeXRlKGkpO1xuICAgICAgX3RoaXMud3JpdGVCeXRlKGkgPj4+IDgpO1xuICAgIH07XG5cbiAgICBfdGhpcy53cml0ZUJ5dGVzID0gZnVuY3Rpb24oYiwgb2ZmLCBsZW4pIHtcbiAgICAgIG9mZiA9IG9mZiB8fCAwO1xuICAgICAgbGVuID0gbGVuIHx8IGIubGVuZ3RoO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkgKz0gMSkge1xuICAgICAgICBfdGhpcy53cml0ZUJ5dGUoYltpICsgb2ZmXSk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIF90aGlzLndyaXRlU3RyaW5nID0gZnVuY3Rpb24ocykge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgIF90aGlzLndyaXRlQnl0ZShzLmNoYXJDb2RlQXQoaSkgKTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgX3RoaXMudG9CeXRlQXJyYXkgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBfYnl0ZXM7XG4gICAgfTtcblxuICAgIF90aGlzLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcyA9ICcnO1xuICAgICAgcyArPSAnWyc7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IF9ieXRlcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICBzICs9ICcsJztcbiAgICAgICAgfVxuICAgICAgICBzICs9IF9ieXRlc1tpXTtcbiAgICAgIH1cbiAgICAgIHMgKz0gJ10nO1xuICAgICAgcmV0dXJuIHM7XG4gICAgfTtcblxuICAgIHJldHVybiBfdGhpcztcbiAgfTtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBiYXNlNjRFbmNvZGVPdXRwdXRTdHJlYW1cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICB2YXIgYmFzZTY0RW5jb2RlT3V0cHV0U3RyZWFtID0gZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgX2J1ZmZlciA9IDA7XG4gICAgdmFyIF9idWZsZW4gPSAwO1xuICAgIHZhciBfbGVuZ3RoID0gMDtcbiAgICB2YXIgX2Jhc2U2NCA9ICcnO1xuXG4gICAgdmFyIF90aGlzID0ge307XG5cbiAgICB2YXIgd3JpdGVFbmNvZGVkID0gZnVuY3Rpb24oYikge1xuICAgICAgX2Jhc2U2NCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGVuY29kZShiICYgMHgzZikgKTtcbiAgICB9O1xuXG4gICAgdmFyIGVuY29kZSA9IGZ1bmN0aW9uKG4pIHtcbiAgICAgIGlmIChuIDwgMCkge1xuICAgICAgICAvLyBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAobiA8IDI2KSB7XG4gICAgICAgIHJldHVybiAweDQxICsgbjtcbiAgICAgIH0gZWxzZSBpZiAobiA8IDUyKSB7XG4gICAgICAgIHJldHVybiAweDYxICsgKG4gLSAyNik7XG4gICAgICB9IGVsc2UgaWYgKG4gPCA2Mikge1xuICAgICAgICByZXR1cm4gMHgzMCArIChuIC0gNTIpO1xuICAgICAgfSBlbHNlIGlmIChuID09IDYyKSB7XG4gICAgICAgIHJldHVybiAweDJiO1xuICAgICAgfSBlbHNlIGlmIChuID09IDYzKSB7XG4gICAgICAgIHJldHVybiAweDJmO1xuICAgICAgfVxuICAgICAgdGhyb3cgJ246JyArIG47XG4gICAgfTtcblxuICAgIF90aGlzLndyaXRlQnl0ZSA9IGZ1bmN0aW9uKG4pIHtcblxuICAgICAgX2J1ZmZlciA9IChfYnVmZmVyIDw8IDgpIHwgKG4gJiAweGZmKTtcbiAgICAgIF9idWZsZW4gKz0gODtcbiAgICAgIF9sZW5ndGggKz0gMTtcblxuICAgICAgd2hpbGUgKF9idWZsZW4gPj0gNikge1xuICAgICAgICB3cml0ZUVuY29kZWQoX2J1ZmZlciA+Pj4gKF9idWZsZW4gLSA2KSApO1xuICAgICAgICBfYnVmbGVuIC09IDY7XG4gICAgICB9XG4gICAgfTtcblxuICAgIF90aGlzLmZsdXNoID0gZnVuY3Rpb24oKSB7XG5cbiAgICAgIGlmIChfYnVmbGVuID4gMCkge1xuICAgICAgICB3cml0ZUVuY29kZWQoX2J1ZmZlciA8PCAoNiAtIF9idWZsZW4pICk7XG4gICAgICAgIF9idWZmZXIgPSAwO1xuICAgICAgICBfYnVmbGVuID0gMDtcbiAgICAgIH1cblxuICAgICAgaWYgKF9sZW5ndGggJSAzICE9IDApIHtcbiAgICAgICAgLy8gcGFkZGluZ1xuICAgICAgICB2YXIgcGFkbGVuID0gMyAtIF9sZW5ndGggJSAzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBhZGxlbjsgaSArPSAxKSB7XG4gICAgICAgICAgX2Jhc2U2NCArPSAnPSc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgX3RoaXMudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBfYmFzZTY0O1xuICAgIH07XG5cbiAgICByZXR1cm4gX3RoaXM7XG4gIH07XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgLy8gYmFzZTY0RGVjb2RlSW5wdXRTdHJlYW1cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICB2YXIgYmFzZTY0RGVjb2RlSW5wdXRTdHJlYW0gPSBmdW5jdGlvbihzdHIpIHtcblxuICAgIHZhciBfc3RyID0gc3RyO1xuICAgIHZhciBfcG9zID0gMDtcbiAgICB2YXIgX2J1ZmZlciA9IDA7XG4gICAgdmFyIF9idWZsZW4gPSAwO1xuXG4gICAgdmFyIF90aGlzID0ge307XG5cbiAgICBfdGhpcy5yZWFkID0gZnVuY3Rpb24oKSB7XG5cbiAgICAgIHdoaWxlIChfYnVmbGVuIDwgOCkge1xuXG4gICAgICAgIGlmIChfcG9zID49IF9zdHIubGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKF9idWZsZW4gPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBlbmQgb2YgZmlsZS4vJyArIF9idWZsZW47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgYyA9IF9zdHIuY2hhckF0KF9wb3MpO1xuICAgICAgICBfcG9zICs9IDE7XG5cbiAgICAgICAgaWYgKGMgPT0gJz0nKSB7XG4gICAgICAgICAgX2J1ZmxlbiA9IDA7XG4gICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9IGVsc2UgaWYgKGMubWF0Y2goL15cXHMkLykgKSB7XG4gICAgICAgICAgLy8gaWdub3JlIGlmIHdoaXRlc3BhY2UuXG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBfYnVmZmVyID0gKF9idWZmZXIgPDwgNikgfCBkZWNvZGUoYy5jaGFyQ29kZUF0KDApICk7XG4gICAgICAgIF9idWZsZW4gKz0gNjtcbiAgICAgIH1cblxuICAgICAgdmFyIG4gPSAoX2J1ZmZlciA+Pj4gKF9idWZsZW4gLSA4KSApICYgMHhmZjtcbiAgICAgIF9idWZsZW4gLT0gODtcbiAgICAgIHJldHVybiBuO1xuICAgIH07XG5cbiAgICB2YXIgZGVjb2RlID0gZnVuY3Rpb24oYykge1xuICAgICAgaWYgKDB4NDEgPD0gYyAmJiBjIDw9IDB4NWEpIHtcbiAgICAgICAgcmV0dXJuIGMgLSAweDQxO1xuICAgICAgfSBlbHNlIGlmICgweDYxIDw9IGMgJiYgYyA8PSAweDdhKSB7XG4gICAgICAgIHJldHVybiBjIC0gMHg2MSArIDI2O1xuICAgICAgfSBlbHNlIGlmICgweDMwIDw9IGMgJiYgYyA8PSAweDM5KSB7XG4gICAgICAgIHJldHVybiBjIC0gMHgzMCArIDUyO1xuICAgICAgfSBlbHNlIGlmIChjID09IDB4MmIpIHtcbiAgICAgICAgcmV0dXJuIDYyO1xuICAgICAgfSBlbHNlIGlmIChjID09IDB4MmYpIHtcbiAgICAgICAgcmV0dXJuIDYzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgJ2M6JyArIGM7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBfdGhpcztcbiAgfTtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyBnaWZJbWFnZSAoQi9XKVxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIHZhciBnaWZJbWFnZSA9IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQpIHtcblxuICAgIHZhciBfd2lkdGggPSB3aWR0aDtcbiAgICB2YXIgX2hlaWdodCA9IGhlaWdodDtcbiAgICB2YXIgX2RhdGEgPSBuZXcgQXJyYXkod2lkdGggKiBoZWlnaHQpO1xuXG4gICAgdmFyIF90aGlzID0ge307XG5cbiAgICBfdGhpcy5zZXRQaXhlbCA9IGZ1bmN0aW9uKHgsIHksIHBpeGVsKSB7XG4gICAgICBfZGF0YVt5ICogX3dpZHRoICsgeF0gPSBwaXhlbDtcbiAgICB9O1xuXG4gICAgX3RoaXMud3JpdGUgPSBmdW5jdGlvbihvdXQpIHtcblxuICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIC8vIEdJRiBTaWduYXR1cmVcblxuICAgICAgb3V0LndyaXRlU3RyaW5nKCdHSUY4N2EnKTtcblxuICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIC8vIFNjcmVlbiBEZXNjcmlwdG9yXG5cbiAgICAgIG91dC53cml0ZVNob3J0KF93aWR0aCk7XG4gICAgICBvdXQud3JpdGVTaG9ydChfaGVpZ2h0KTtcblxuICAgICAgb3V0LndyaXRlQnl0ZSgweDgwKTsgLy8gMmJpdFxuICAgICAgb3V0LndyaXRlQnl0ZSgwKTtcbiAgICAgIG91dC53cml0ZUJ5dGUoMCk7XG5cbiAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAvLyBHbG9iYWwgQ29sb3IgTWFwXG5cbiAgICAgIC8vIGJsYWNrXG4gICAgICBvdXQud3JpdGVCeXRlKDB4MDApO1xuICAgICAgb3V0LndyaXRlQnl0ZSgweDAwKTtcbiAgICAgIG91dC53cml0ZUJ5dGUoMHgwMCk7XG5cbiAgICAgIC8vIHdoaXRlXG4gICAgICBvdXQud3JpdGVCeXRlKDB4ZmYpO1xuICAgICAgb3V0LndyaXRlQnl0ZSgweGZmKTtcbiAgICAgIG91dC53cml0ZUJ5dGUoMHhmZik7XG5cbiAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAvLyBJbWFnZSBEZXNjcmlwdG9yXG5cbiAgICAgIG91dC53cml0ZVN0cmluZygnLCcpO1xuICAgICAgb3V0LndyaXRlU2hvcnQoMCk7XG4gICAgICBvdXQud3JpdGVTaG9ydCgwKTtcbiAgICAgIG91dC53cml0ZVNob3J0KF93aWR0aCk7XG4gICAgICBvdXQud3JpdGVTaG9ydChfaGVpZ2h0KTtcbiAgICAgIG91dC53cml0ZUJ5dGUoMCk7XG5cbiAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAvLyBMb2NhbCBDb2xvciBNYXBcblxuICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIC8vIFJhc3RlciBEYXRhXG5cbiAgICAgIHZhciBsendNaW5Db2RlU2l6ZSA9IDI7XG4gICAgICB2YXIgcmFzdGVyID0gZ2V0TFpXUmFzdGVyKGx6d01pbkNvZGVTaXplKTtcblxuICAgICAgb3V0LndyaXRlQnl0ZShsendNaW5Db2RlU2l6ZSk7XG5cbiAgICAgIHZhciBvZmZzZXQgPSAwO1xuXG4gICAgICB3aGlsZSAocmFzdGVyLmxlbmd0aCAtIG9mZnNldCA+IDI1NSkge1xuICAgICAgICBvdXQud3JpdGVCeXRlKDI1NSk7XG4gICAgICAgIG91dC53cml0ZUJ5dGVzKHJhc3Rlciwgb2Zmc2V0LCAyNTUpO1xuICAgICAgICBvZmZzZXQgKz0gMjU1O1xuICAgICAgfVxuXG4gICAgICBvdXQud3JpdGVCeXRlKHJhc3Rlci5sZW5ndGggLSBvZmZzZXQpO1xuICAgICAgb3V0LndyaXRlQnl0ZXMocmFzdGVyLCBvZmZzZXQsIHJhc3Rlci5sZW5ndGggLSBvZmZzZXQpO1xuICAgICAgb3V0LndyaXRlQnl0ZSgweDAwKTtcblxuICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgIC8vIEdJRiBUZXJtaW5hdG9yXG4gICAgICBvdXQud3JpdGVTdHJpbmcoJzsnKTtcbiAgICB9O1xuXG4gICAgdmFyIGJpdE91dHB1dFN0cmVhbSA9IGZ1bmN0aW9uKG91dCkge1xuXG4gICAgICB2YXIgX291dCA9IG91dDtcbiAgICAgIHZhciBfYml0TGVuZ3RoID0gMDtcbiAgICAgIHZhciBfYml0QnVmZmVyID0gMDtcblxuICAgICAgdmFyIF90aGlzID0ge307XG5cbiAgICAgIF90aGlzLndyaXRlID0gZnVuY3Rpb24oZGF0YSwgbGVuZ3RoKSB7XG5cbiAgICAgICAgaWYgKCAoZGF0YSA+Pj4gbGVuZ3RoKSAhPSAwKSB7XG4gICAgICAgICAgdGhyb3cgJ2xlbmd0aCBvdmVyJztcbiAgICAgICAgfVxuXG4gICAgICAgIHdoaWxlIChfYml0TGVuZ3RoICsgbGVuZ3RoID49IDgpIHtcbiAgICAgICAgICBfb3V0LndyaXRlQnl0ZSgweGZmICYgKCAoZGF0YSA8PCBfYml0TGVuZ3RoKSB8IF9iaXRCdWZmZXIpICk7XG4gICAgICAgICAgbGVuZ3RoIC09ICg4IC0gX2JpdExlbmd0aCk7XG4gICAgICAgICAgZGF0YSA+Pj49ICg4IC0gX2JpdExlbmd0aCk7XG4gICAgICAgICAgX2JpdEJ1ZmZlciA9IDA7XG4gICAgICAgICAgX2JpdExlbmd0aCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBfYml0QnVmZmVyID0gKGRhdGEgPDwgX2JpdExlbmd0aCkgfCBfYml0QnVmZmVyO1xuICAgICAgICBfYml0TGVuZ3RoID0gX2JpdExlbmd0aCArIGxlbmd0aDtcbiAgICAgIH07XG5cbiAgICAgIF90aGlzLmZsdXNoID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmIChfYml0TGVuZ3RoID4gMCkge1xuICAgICAgICAgIF9vdXQud3JpdGVCeXRlKF9iaXRCdWZmZXIpO1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gX3RoaXM7XG4gICAgfTtcblxuICAgIHZhciBnZXRMWldSYXN0ZXIgPSBmdW5jdGlvbihsendNaW5Db2RlU2l6ZSkge1xuXG4gICAgICB2YXIgY2xlYXJDb2RlID0gMSA8PCBsendNaW5Db2RlU2l6ZTtcbiAgICAgIHZhciBlbmRDb2RlID0gKDEgPDwgbHp3TWluQ29kZVNpemUpICsgMTtcbiAgICAgIHZhciBiaXRMZW5ndGggPSBsendNaW5Db2RlU2l6ZSArIDE7XG5cbiAgICAgIC8vIFNldHVwIExaV1RhYmxlXG4gICAgICB2YXIgdGFibGUgPSBsendUYWJsZSgpO1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsZWFyQ29kZTsgaSArPSAxKSB7XG4gICAgICAgIHRhYmxlLmFkZChTdHJpbmcuZnJvbUNoYXJDb2RlKGkpICk7XG4gICAgICB9XG4gICAgICB0YWJsZS5hZGQoU3RyaW5nLmZyb21DaGFyQ29kZShjbGVhckNvZGUpICk7XG4gICAgICB0YWJsZS5hZGQoU3RyaW5nLmZyb21DaGFyQ29kZShlbmRDb2RlKSApO1xuXG4gICAgICB2YXIgYnl0ZU91dCA9IGJ5dGVBcnJheU91dHB1dFN0cmVhbSgpO1xuICAgICAgdmFyIGJpdE91dCA9IGJpdE91dHB1dFN0cmVhbShieXRlT3V0KTtcblxuICAgICAgLy8gY2xlYXIgY29kZVxuICAgICAgYml0T3V0LndyaXRlKGNsZWFyQ29kZSwgYml0TGVuZ3RoKTtcblxuICAgICAgdmFyIGRhdGFJbmRleCA9IDA7XG5cbiAgICAgIHZhciBzID0gU3RyaW5nLmZyb21DaGFyQ29kZShfZGF0YVtkYXRhSW5kZXhdKTtcbiAgICAgIGRhdGFJbmRleCArPSAxO1xuXG4gICAgICB3aGlsZSAoZGF0YUluZGV4IDwgX2RhdGEubGVuZ3RoKSB7XG5cbiAgICAgICAgdmFyIGMgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKF9kYXRhW2RhdGFJbmRleF0pO1xuICAgICAgICBkYXRhSW5kZXggKz0gMTtcblxuICAgICAgICBpZiAodGFibGUuY29udGFpbnMocyArIGMpICkge1xuXG4gICAgICAgICAgcyA9IHMgKyBjO1xuXG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICBiaXRPdXQud3JpdGUodGFibGUuaW5kZXhPZihzKSwgYml0TGVuZ3RoKTtcblxuICAgICAgICAgIGlmICh0YWJsZS5zaXplKCkgPCAweGZmZikge1xuXG4gICAgICAgICAgICBpZiAodGFibGUuc2l6ZSgpID09ICgxIDw8IGJpdExlbmd0aCkgKSB7XG4gICAgICAgICAgICAgIGJpdExlbmd0aCArPSAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0YWJsZS5hZGQocyArIGMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHMgPSBjO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGJpdE91dC53cml0ZSh0YWJsZS5pbmRleE9mKHMpLCBiaXRMZW5ndGgpO1xuXG4gICAgICAvLyBlbmQgY29kZVxuICAgICAgYml0T3V0LndyaXRlKGVuZENvZGUsIGJpdExlbmd0aCk7XG5cbiAgICAgIGJpdE91dC5mbHVzaCgpO1xuXG4gICAgICByZXR1cm4gYnl0ZU91dC50b0J5dGVBcnJheSgpO1xuICAgIH07XG5cbiAgICB2YXIgbHp3VGFibGUgPSBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIF9tYXAgPSB7fTtcbiAgICAgIHZhciBfc2l6ZSA9IDA7XG5cbiAgICAgIHZhciBfdGhpcyA9IHt9O1xuXG4gICAgICBfdGhpcy5hZGQgPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgaWYgKF90aGlzLmNvbnRhaW5zKGtleSkgKSB7XG4gICAgICAgICAgdGhyb3cgJ2R1cCBrZXk6JyArIGtleTtcbiAgICAgICAgfVxuICAgICAgICBfbWFwW2tleV0gPSBfc2l6ZTtcbiAgICAgICAgX3NpemUgKz0gMTtcbiAgICAgIH07XG5cbiAgICAgIF90aGlzLnNpemUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIF9zaXplO1xuICAgICAgfTtcblxuICAgICAgX3RoaXMuaW5kZXhPZiA9IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICByZXR1cm4gX21hcFtrZXldO1xuICAgICAgfTtcblxuICAgICAgX3RoaXMuY29udGFpbnMgPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiBfbWFwW2tleV0gIT0gJ3VuZGVmaW5lZCc7XG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gX3RoaXM7XG4gICAgfTtcblxuICAgIHJldHVybiBfdGhpcztcbiAgfTtcblxuICB2YXIgY3JlYXRlRGF0YVVSTCA9IGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQsIGdldFBpeGVsKSB7XG4gICAgdmFyIGdpZiA9IGdpZkltYWdlKHdpZHRoLCBoZWlnaHQpO1xuICAgIGZvciAodmFyIHkgPSAwOyB5IDwgaGVpZ2h0OyB5ICs9IDEpIHtcbiAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgd2lkdGg7IHggKz0gMSkge1xuICAgICAgICBnaWYuc2V0UGl4ZWwoeCwgeSwgZ2V0UGl4ZWwoeCwgeSkgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgYiA9IGJ5dGVBcnJheU91dHB1dFN0cmVhbSgpO1xuICAgIGdpZi53cml0ZShiKTtcblxuICAgIHZhciBiYXNlNjQgPSBiYXNlNjRFbmNvZGVPdXRwdXRTdHJlYW0oKTtcbiAgICB2YXIgYnl0ZXMgPSBiLnRvQnl0ZUFycmF5KCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgYmFzZTY0LndyaXRlQnl0ZShieXRlc1tpXSk7XG4gICAgfVxuICAgIGJhc2U2NC5mbHVzaCgpO1xuXG4gICAgcmV0dXJuICdkYXRhOmltYWdlL2dpZjtiYXNlNjQsJyArIGJhc2U2NDtcbiAgfTtcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAvLyByZXR1cm5zIHFyY29kZSBmdW5jdGlvbi5cblxuICByZXR1cm4gcXJjb2RlO1xufSgpO1xuXG4vLyBtdWx0aWJ5dGUgc3VwcG9ydFxuIWZ1bmN0aW9uKCkge1xuXG4gIHFyY29kZS5zdHJpbmdUb0J5dGVzRnVuY3NbJ1VURi04J10gPSBmdW5jdGlvbihzKSB7XG4gICAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xODcyOTQwNS9ob3ctdG8tY29udmVydC11dGY4LXN0cmluZy10by1ieXRlLWFycmF5XG4gICAgZnVuY3Rpb24gdG9VVEY4QXJyYXkoc3RyKSB7XG4gICAgICB2YXIgdXRmOCA9IFtdO1xuICAgICAgZm9yICh2YXIgaT0wOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGFyY29kZSA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2hhcmNvZGUgPCAweDgwKSB1dGY4LnB1c2goY2hhcmNvZGUpO1xuICAgICAgICBlbHNlIGlmIChjaGFyY29kZSA8IDB4ODAwKSB7XG4gICAgICAgICAgdXRmOC5wdXNoKDB4YzAgfCAoY2hhcmNvZGUgPj4gNiksXG4gICAgICAgICAgICAgIDB4ODAgfCAoY2hhcmNvZGUgJiAweDNmKSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2hhcmNvZGUgPCAweGQ4MDAgfHwgY2hhcmNvZGUgPj0gMHhlMDAwKSB7XG4gICAgICAgICAgdXRmOC5wdXNoKDB4ZTAgfCAoY2hhcmNvZGUgPj4gMTIpLFxuICAgICAgICAgICAgICAweDgwIHwgKChjaGFyY29kZT4+NikgJiAweDNmKSxcbiAgICAgICAgICAgICAgMHg4MCB8IChjaGFyY29kZSAmIDB4M2YpKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBzdXJyb2dhdGUgcGFpclxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBpKys7XG4gICAgICAgICAgLy8gVVRGLTE2IGVuY29kZXMgMHgxMDAwMC0weDEwRkZGRiBieVxuICAgICAgICAgIC8vIHN1YnRyYWN0aW5nIDB4MTAwMDAgYW5kIHNwbGl0dGluZyB0aGVcbiAgICAgICAgICAvLyAyMCBiaXRzIG9mIDB4MC0weEZGRkZGIGludG8gdHdvIGhhbHZlc1xuICAgICAgICAgIGNoYXJjb2RlID0gMHgxMDAwMCArICgoKGNoYXJjb2RlICYgMHgzZmYpPDwxMClcbiAgICAgICAgICAgIHwgKHN0ci5jaGFyQ29kZUF0KGkpICYgMHgzZmYpKTtcbiAgICAgICAgICB1dGY4LnB1c2goMHhmMCB8IChjaGFyY29kZSA+PjE4KSxcbiAgICAgICAgICAgICAgMHg4MCB8ICgoY2hhcmNvZGU+PjEyKSAmIDB4M2YpLFxuICAgICAgICAgICAgICAweDgwIHwgKChjaGFyY29kZT4+NikgJiAweDNmKSxcbiAgICAgICAgICAgICAgMHg4MCB8IChjaGFyY29kZSAmIDB4M2YpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHV0Zjg7XG4gICAgfVxuICAgIHJldHVybiB0b1VURjhBcnJheShzKTtcbiAgfTtcblxufSgpO1xuXG4oZnVuY3Rpb24gKGZhY3RvcnkpIHtcbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgZGVmaW5lKFtdLCBmYWN0b3J5KTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuICB9XG59KGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gcXJjb2RlO1xufSkpO1xuIiwgIi8qKlxuICogZHNoLXJlbW90ZS1jb250cm9sLWJyaWRnZSBcdTc2ODQgV2ViIFx1NUJBMlx1NjIzN1x1N0FFRlx1NTM0QVx1OEZCOVx1RkYxQVxuICogXHU1NzI4XHU0RkE3XHU4RkI5XHU2ODBGXHU4MTFBXHU5MEU4XHVGRjA4XHU4QkJFXHU3RjZFXHU2NUMxXHVGRjA5XHU2MzAyXHU0RTAwXHU0RTJBXHUzMDBDXHU4RkRFXHU2M0E1XHU3OUZCXHU1MkE4XHU3QUVGXHUzMDBEXHU1MTY1XHU1M0UzXHVGRjBDXHU1RjM5XHU3QTk3XHU1MTg1XHU1QzU1XHU3OTNBXHU5MTREXHU1QkY5XHU0RThDXHU3RUY0XHU3ODAxXG4gKiBcdTRFMEVcdTVCOUVcdTY1RjZcdThGREVcdTYzQTVcdTcyQjZcdTYwMDFcdUZGMDhcdTVGNTNcdTUyNERcdThGREVcdTYzQTVcdTRFODZcdTU0RUFcdTUzRjBcdTYyNEJcdTY3M0FcdUZGMDlcdTMwMDJcbiAqL1xuaW1wb3J0IHsgdXNlRWZmZWN0LCB1c2VNZW1vLCB1c2VTdGF0ZSB9IGZyb20gJ3JlYWN0J1xuaW1wb3J0IHsgTW9kYWwgfSBmcm9tICdAZGVlcHNlZWstYWkvZHNoLWNsaWVudC11aS1wcmltaXRpdmVzJ1xuaW1wb3J0IHFyY29kZSBmcm9tICdxcmNvZGUtZ2VuZXJhdG9yJ1xuXG4vLyAtLS0tIGNsaWVudCBcdTY3MERcdTUyQTFcdTZDRThcdTUxNjUgLS0tLVxuZXhwb3J0IGNvbnN0IGluamVjdCA9IFsnc2xvdHMnXSBhcyBjb25zdFxuXG5pbnRlcmZhY2UgUGFpckluZm8ge1xuICB2OiBudW1iZXJcbiAgdDogc3RyaW5nXG4gIHNlcnZlcklkPzogc3RyaW5nXG4gIGhvc3RuYW1lPzogc3RyaW5nXG4gIGV4cGlyZXNBdDogbnVtYmVyXG4gIHVybHM6IHN0cmluZ1tdXG59XG5cbmludGVyZmFjZSBDb25uZWN0ZWREZXZpY2Uge1xuICBkZXZpY2VJZDogc3RyaW5nXG4gIG5hbWU6IHN0cmluZ1xuICBtb2RlbD86IHN0cmluZ1xuICBjb25uZWN0ZWRBdDogbnVtYmVyXG59XG5cbmNvbnN0IFBPTExfTVMgPSAyXzAwMFxuXG5hc3luYyBmdW5jdGlvbiBmZXRjaFBhaXJJbmZvKCk6IFByb21pc2U8UGFpckluZm8+IHtcbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goJy9yZW1vdGUvcGFpci1pbmZvJylcbiAgaWYgKCFyZXMub2spIHRocm93IG5ldyBFcnJvcihgcGFpci1pbmZvICR7cmVzLnN0YXR1c31gKVxuICByZXR1cm4gKGF3YWl0IHJlcy5qc29uKCkpIGFzIFBhaXJJbmZvXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoQ29ubmVjdGVkKCk6IFByb21pc2U8Q29ubmVjdGVkRGV2aWNlW10+IHtcbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goJy9yZW1vdGUvY29ubmVjdGVkJylcbiAgaWYgKCFyZXMub2spIHJldHVybiBbXVxuICByZXR1cm4gKGF3YWl0IHJlcy5qc29uKCkpIGFzIENvbm5lY3RlZERldmljZVtdXG59XG5cbmZ1bmN0aW9uIGJ1aWxkUXJTdmcoaW5mbzogUGFpckluZm8pOiBzdHJpbmcge1xuICBjb25zdCBwYXlsb2FkID0gSlNPTi5zdHJpbmdpZnkoe1xuICAgIHY6IDEsXG4gICAgdDogJ2RzaC1yZW1vdGUnLFxuICAgIHNlcnZlcklkOiBpbmZvLnNlcnZlcklkLFxuICAgIGhvc3RuYW1lOiBpbmZvLmhvc3RuYW1lLFxuICAgIGV4cGlyZXNBdDogaW5mby5leHBpcmVzQXQsXG4gICAgdXJsczogaW5mby51cmxzLFxuICB9KVxuICBjb25zdCBxciA9IHFyY29kZSgwLCAnTScpXG4gIHFyLmFkZERhdGEocGF5bG9hZClcbiAgcXIubWFrZSgpXG4gIHJldHVybiBxci5jcmVhdGVTdmdUYWcoeyBjZWxsU2l6ZTogNCwgbWFyZ2luOiAwLCBzY2FsYWJsZTogdHJ1ZSB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHkoY3R4OiB7IHNsb3RzOiBTbG90c0ZhY2UgfSk6IHZvaWQge1xuICBjdHguc2xvdHMuaW5qZWN0KCdzaWRlYmFyLmZvb3Rlci5hY3Rpb24nLCAoKSA9PlxuICAgIGN0eC5zbG90cy5yZWdpc3RlcihcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ3NpZGViYXIuZm9vdGVyLmFjdGlvbicsXG4gICAgICAgIGlkOiAnbW9iaWxlLXBhaXInLFxuICAgICAgfSxcbiAgICAgIE1vYmlsZVBhaXJCdXR0b24sXG4gICAgKSxcbiAgKVxufVxuXG4vLyAtLS0tIFx1Njc4MVx1N0I4MCBzbG90cyBcdTdDN0JcdTU3OEJcdTk3NjJcdUZGMDhcdTY3MkNcdTYzRDJcdTRFRjZcdTUzRUFcdTc1MjggaW5qZWN0L3JlZ2lzdGVyXHVGRjA5IC0tLS1cbmludGVyZmFjZSBTbG90c0ZhY2Uge1xuICBpbmplY3Qoc2xvdDogc3RyaW5nLCByZWdpc3RyYXRpb246ICgpID0+IHVua25vd24pOiB2b2lkXG4gIHJlZ2lzdGVyKG9wdGlvbnM6IHsgbmFtZTogc3RyaW5nOyBpZD86IHN0cmluZyB9LCBjb21wb25lbnQ6IFJlYWN0LkNvbXBvbmVudFR5cGU8YW55Pik6IHVua25vd25cbn1cblxuLy8gPT09PT09PT09PT09PT09PT0gXHU1MTY1XHU1M0UzXHU2MzA5XHU5NEFFID09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIE1vYmlsZVBhaXJCdXR0b24oeyB3aWRlIH06IHsgd2lkZT86IGJvb2xlYW4gfSkge1xuICBjb25zdCBbb3Blbiwgc2V0T3Blbl0gPSB1c2VTdGF0ZShmYWxzZSlcbiAgY29uc3QgW2Nvbm5lY3RlZENvdW50LCBzZXRDb25uZWN0ZWRDb3VudF0gPSB1c2VTdGF0ZSgwKVxuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKCFvcGVuKSByZXR1cm5cbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgdGljayA9IGFzeW5jICgpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGRldmljZXMgPSBhd2FpdCBmZXRjaENvbm5lY3RlZCgpXG4gICAgICAgIGlmIChhbGl2ZSkgc2V0Q29ubmVjdGVkQ291bnQoZGV2aWNlcy5sZW5ndGgpXG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLyogXHU1RkZEXHU3NTY1XHU4RjZFXHU4QkUyXHU1OTMxXHU4RDI1ICovXG4gICAgICB9XG4gICAgfVxuICAgIHRpY2soKVxuICAgIGNvbnN0IHRpbWVyID0gd2luZG93LnNldEludGVydmFsKHRpY2ssIFBPTExfTVMpXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIGFsaXZlID0gZmFsc2VcbiAgICAgIHdpbmRvdy5jbGVhckludGVydmFsKHRpbWVyKVxuICAgIH1cbiAgfSwgW29wZW5dKVxuXG4gIHJldHVybiAoXG4gICAgPD5cbiAgICAgIDxidXR0b25cbiAgICAgICAgdHlwZT1cImJ1dHRvblwiXG4gICAgICAgIGNsYXNzTmFtZT1cInJjcC10cmlnZ2VyXCJcbiAgICAgICAgZGF0YS13aWRlPXt3aWRlID8gJ3RydWUnIDogJ2ZhbHNlJ31cbiAgICAgICAgdGl0bGU9XCJcdThGREVcdTYzQTVcdTc5RkJcdTUyQThcdTdBRUZcIlxuICAgICAgICBhcmlhLWxhYmVsPVwiXHU4RkRFXHU2M0E1XHU3OUZCXHU1MkE4XHU3QUVGXCJcbiAgICAgICAgb25DbGljaz17KCkgPT4gc2V0T3Blbih0cnVlKX1cbiAgICAgID5cbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicmNwLXRyaWdnZXItaWNvblwiIGFyaWEtaGlkZGVuPlxuICAgICAgICAgIFx1RDgzRFx1RENGMVxuICAgICAgICA8L3NwYW4+XG4gICAgICAgIHt3aWRlID8gPHNwYW4gY2xhc3NOYW1lPVwicmNwLXRyaWdnZXItbGFiZWxcIj5cdThGREVcdTYzQTVcdTc5RkJcdTUyQThcdTdBRUY8L3NwYW4+IDogbnVsbH1cbiAgICAgICAge2Nvbm5lY3RlZENvdW50ID4gMCA/IDxzcGFuIGNsYXNzTmFtZT1cInJjcC10cmlnZ2VyLWRvdFwiIC8+IDogbnVsbH1cbiAgICAgIDwvYnV0dG9uPlxuICAgICAgPE1vZGFsXG4gICAgICAgIG9wZW49e29wZW59XG4gICAgICAgIG9uQ2xvc2U9eygpID0+IHNldE9wZW4oZmFsc2UpfVxuICAgICAgICB0aXRsZT1cIlx1OEZERVx1NjNBNVx1NzlGQlx1NTJBOFx1N0FFRlwiXG4gICAgICAgIGNsb3NlTGFiZWw9XCJcdTUxNzNcdTk1RURcIlxuICAgICAgICBkZXNjcmlwdGlvbj1cIlx1NjI2Qlx1NjNDRlx1NEU4Q1x1N0VGNFx1NzgwMVx1RkYwQ1x1NjI4QVx1NjI0Qlx1NjczQVx1OEZERVx1NjNBNVx1NTIzMFx1OEZEOVx1NTNGMCBEZWVwU2VlayBIYXJuZXNzXCJcbiAgICAgID5cbiAgICAgICAgPFBhaXJQYW5lbCBvbkNvbm5lY3RlZENvdW50PXtzZXRDb25uZWN0ZWRDb3VudH0gLz5cbiAgICAgIDwvTW9kYWw+XG4gICAgICA8c3R5bGU+e2Nzc308L3N0eWxlPlxuICAgIDwvPlxuICApXG59XG5cbi8vID09PT09PT09PT09PT09PT09IFx1NUYzOVx1N0E5N1x1NEUzQlx1NEY1MyA9PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBQYWlyUGFuZWwoeyBvbkNvbm5lY3RlZENvdW50IH06IHsgb25Db25uZWN0ZWRDb3VudDogKG46IG51bWJlcikgPT4gdm9pZCB9KSB7XG4gIGNvbnN0IFtwaGFzZSwgc2V0UGhhc2VdID0gdXNlU3RhdGU8J2xvYWRpbmcnIHwgJ3JlYWR5JyB8ICdlcnJvcicgfCAnY29ubmVjdGVkJz4oJ2xvYWRpbmcnKVxuICBjb25zdCBbcGFpciwgc2V0UGFpcl0gPSB1c2VTdGF0ZTxQYWlySW5mbyB8IG51bGw+KG51bGwpXG4gIGNvbnN0IFtlcnJvciwgc2V0RXJyb3JdID0gdXNlU3RhdGUoJycpXG4gIGNvbnN0IFtkZXZpY2VzLCBzZXREZXZpY2VzXSA9IHVzZVN0YXRlPENvbm5lY3RlZERldmljZVtdPihbXSlcbiAgY29uc3QgW3BhaXJpbmcsIHNldFBhaXJpbmddID0gdXNlU3RhdGUoZmFsc2UpXG5cbiAgY29uc3Qgc3ZnID0gdXNlTWVtbygoKSA9PiAocGFpciA/IGJ1aWxkUXJTdmcocGFpcikgOiAnJyksIFtwYWlyXSlcblxuICBjb25zdCByZWZyZXNoID0gYXN5bmMgKHNpbGVudDogYm9vbGVhbikgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBpbmZvID0gYXdhaXQgZmV0Y2hQYWlySW5mbygpXG4gICAgICBzZXRQYWlyKGluZm8pXG4gICAgICBzZXRQaGFzZSgoY3VyKSA9PiAoY3VyID09PSAnY29ubmVjdGVkJyA/IGN1ciA6ICdyZWFkeScpKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICghc2lsZW50KSB7XG4gICAgICAgIHNldFBoYXNlKCdlcnJvcicpXG4gICAgICAgIHNldEVycm9yKGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgIHNldFBoYXNlKCdsb2FkaW5nJylcbiAgICBzZXRQYWlyaW5nKGZhbHNlKVxuICAgIHJlZnJlc2goZmFsc2UpXG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGxldCBwZW5kaW5nID0gZmFsc2VcbiAgICBjb25zdCBwb2xsID0gYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKHBlbmRpbmcpIHJldHVyblxuICAgICAgcGVuZGluZyA9IHRydWVcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGxpc3QgPSBhd2FpdCBmZXRjaENvbm5lY3RlZCgpXG4gICAgICAgIGlmICghYWxpdmUpIHJldHVyblxuICAgICAgICBzZXREZXZpY2VzKGxpc3QpXG4gICAgICAgIG9uQ29ubmVjdGVkQ291bnQobGlzdC5sZW5ndGgpXG4gICAgICAgIGlmIChsaXN0Lmxlbmd0aCA+IDApIHNldFBoYXNlKCdjb25uZWN0ZWQnKVxuICAgICAgICBlbHNlIHNldFBoYXNlKChjdXIpID0+IChjdXIgPT09ICdjb25uZWN0ZWQnID8gJ3JlYWR5JyA6IGN1cikpXG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLyogXHU1RkZEXHU3NTY1ICovXG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBwZW5kaW5nID0gZmFsc2VcbiAgICAgIH1cbiAgICB9XG4gICAgcG9sbCgpXG4gICAgY29uc3QgdGltZXIgPSB3aW5kb3cuc2V0SW50ZXJ2YWwocG9sbCwgUE9MTF9NUylcbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgYWxpdmUgPSBmYWxzZVxuICAgICAgd2luZG93LmNsZWFySW50ZXJ2YWwodGltZXIpXG4gICAgfVxuICB9LCBbb25Db25uZWN0ZWRDb3VudF0pXG5cbiAgLy8gXHU0RThDXHU3RUY0XHU3ODAxXHU1MjMwXHU2NzFGXHU4MUVBXHU1MkE4XHU1MjM3XHU2NUIwXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgaWYgKCFwYWlyIHx8IHBoYXNlID09PSAnY29ubmVjdGVkJykgcmV0dXJuXG4gICAgY29uc3QgbGVmdCA9IHBhaXIuZXhwaXJlc0F0IC0gRGF0ZS5ub3coKVxuICAgIGlmIChsZWZ0IDw9IDApIHtcbiAgICAgIHJlZnJlc2godHJ1ZSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCB0aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHJlZnJlc2godHJ1ZSksIE1hdGgubWF4KGxlZnQgLSAzXzAwMCwgMV8wMDApKVxuICAgIHJldHVybiAoKSA9PiB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVyKVxuICB9LCBbcGFpciwgcGhhc2VdKVxuXG4gIGlmIChwaGFzZSA9PT0gJ2xvYWRpbmcnKSB7XG4gICAgcmV0dXJuIDxkaXYgY2xhc3NOYW1lPVwicmNwLXN0YXRlXCI+XHU3NTFGXHU2MjEwXHU0RThDXHU3RUY0XHU3ODAxXHU0RTJEXHUyMDI2PC9kaXY+XG4gIH1cbiAgaWYgKHBoYXNlID09PSAnZXJyb3InKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmNwLXN0YXRlIHJjcC1lcnJvclwiPlxuICAgICAgICA8ZGl2Plx1NjVFMFx1NkNENVx1ODNCN1x1NTNENlx1OTE0RFx1NUJGOVx1NEZFMVx1NjA2Rlx1RkYxQXtlcnJvcn08L2Rpdj5cbiAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3NOYW1lPVwicmNwLWJ0blwiIG9uQ2xpY2s9eygpID0+IHJlZnJlc2goZmFsc2UpfT5cbiAgICAgICAgICBcdTkxQ0RcdThCRDVcbiAgICAgICAgPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cbiAgaWYgKHBoYXNlID09PSAnY29ubmVjdGVkJyAmJiBkZXZpY2VzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4gKFxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJyY3AtY29ubmVjdGVkXCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmNwLWNvbm5lY3RlZC1jaGVja1wiIGFyaWEtaGlkZGVuPlxuICAgICAgICAgIFx1MjcxM1xuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJyY3AtY29ubmVjdGVkLXRpdGxlXCI+XHU4RkRFXHU2M0E1XHU2MjEwXHU1MjlGPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmNwLWNvbm5lY3RlZC1kZXZpY2VzXCI+XG4gICAgICAgICAge2RldmljZXMubWFwKChkKSA9PiAoXG4gICAgICAgICAgICA8ZGl2IGtleT17ZC5kZXZpY2VJZH0gY2xhc3NOYW1lPVwicmNwLWRldmljZS1yb3dcIj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicmNwLWRldmljZS1kb3RcIiAvPlxuICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyY3AtZGV2aWNlLW5hbWVcIj57ZC5uYW1lfTwvc3Bhbj5cbiAgICAgICAgICAgICAge2QubW9kZWwgPyA8c3BhbiBjbGFzc05hbWU9XCJyY3AtZGV2aWNlLW1vZGVsXCI+e2QubW9kZWx9PC9zcGFuPiA6IG51bGx9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICApKX1cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicmNwLWNvbm5lY3RlZC1oaW50XCI+XHU2MjRCXHU2NzNBXHU2NUFEXHU1RjAwXHU1NDBFXHU0RjFBXHU4MUVBXHU1MkE4XHU1NkRFXHU1MjMwXHU5MTREXHU1QkY5XHU3ODAxPC9kaXY+XG4gICAgICAgIDxidXR0b25cbiAgICAgICAgICB0eXBlPVwiYnV0dG9uXCJcbiAgICAgICAgICBjbGFzc05hbWU9XCJyY3AtYnRuIHJjcC1idG4tZ2hvc3RcIlxuICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgIHNldFBhaXJpbmcodHJ1ZSlcbiAgICAgICAgICAgIHNldFBoYXNlKCdyZWFkeScpXG4gICAgICAgICAgICByZWZyZXNoKGZhbHNlKS5maW5hbGx5KCgpID0+IHNldFBhaXJpbmcoZmFsc2UpKVxuICAgICAgICAgIH19XG4gICAgICAgICAgZGlzYWJsZWQ9e3BhaXJpbmd9XG4gICAgICAgID5cbiAgICAgICAgICB7cGFpcmluZyA/ICdcdTUyMzdcdTY1QjBcdTRFMkRcdTIwMjYnIDogJ1x1NTE4RFx1NkIyMVx1OTE0RFx1NUJGOSd9XG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJyY3AtcGFpclwiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJyY3AtcXJcIiBkYW5nZXJvdXNseVNldElubmVySFRNTD17eyBfX2h0bWw6IHN2ZyB9fSAvPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJyY3Atd2FpdFwiPlxuICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyY3Atd2FpdC1kb3RcIiAvPlxuICAgICAgICBcdTdCNDlcdTVGODVcdTYyNEJcdTY3M0FcdTYyNkJcdTc4MDFcdTIwMjZcbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJyY3AtbWV0YVwiPlxuICAgICAgICB7cGFpcj8uaG9zdG5hbWUgPyA8c3BhbiBjbGFzc05hbWU9XCJyY3AtbWV0YS1pdGVtXCI+XHVEODNEXHVEREE1IHtwYWlyLmhvc3RuYW1lfTwvc3Bhbj4gOiBudWxsfVxuICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJyY3AtbWV0YS1pdGVtXCI+XHU2NzA5XHU2NTQ4XHU2NzFGIHtjb3VudGRvd25PZihwYWlyPy5leHBpcmVzQXQpfTwvc3Bhbj5cbiAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3NOYW1lPVwicmNwLWxpbmtcIiBvbkNsaWNrPXsoKSA9PiByZWZyZXNoKGZhbHNlKX0+XG4gICAgICAgICAgXHU1MjM3XHU2NUIwXG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIClcbn1cblxuZnVuY3Rpb24gY291bnRkb3duT2YoZXhwaXJlc0F0PzogbnVtYmVyKTogc3RyaW5nIHtcbiAgaWYgKCFleHBpcmVzQXQpIHJldHVybiAnLS0nXG4gIGNvbnN0IGxlZnQgPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKChleHBpcmVzQXQgLSBEYXRlLm5vdygpKSAvIDEwMDApKVxuICBjb25zdCBtID0gTWF0aC5mbG9vcihsZWZ0IC8gNjApXG4gIGNvbnN0IHMgPSBsZWZ0ICUgNjBcbiAgcmV0dXJuIGAke1N0cmluZyhtKS5wYWRTdGFydCgyLCAnMCcpfToke1N0cmluZyhzKS5wYWRTdGFydCgyLCAnMCcpfWBcbn1cblxuLy8gPT09PT09PT09PT09PT09PT0gXHU2ODM3XHU1RjBGID09PT09PT09PT09PT09PT09XG5cbmNvbnN0IGNzcyA9IGBcbi5yY3AtdHJpZ2dlcntcbiAgZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtib3JkZXI6bm9uZTtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O1xuICBjb2xvcjp2YXIoLS1kc3ctc2lkZWJhci1mZywjOWFhM2I4KTtjdXJzb3I6cG9pbnRlcjtib3JkZXItcmFkaXVzOjhweDtcbiAgcGFkZGluZzo2cHggOHB4O2ZvbnQtc2l6ZToxM3B4O2xpbmUtaGVpZ2h0OjE7cG9zaXRpb246cmVsYXRpdmU7XG59XG4ucmNwLXRyaWdnZXJbZGF0YS13aWRlPVwidHJ1ZVwiXXt3aWR0aDoxMDAlO2p1c3RpZnktY29udGVudDpmbGV4LXN0YXJ0O3BhZGRpbmc6NnB4IDEwcHg7fVxuLnJjcC10cmlnZ2VyOmhvdmVye2JhY2tncm91bmQ6dmFyKC0tZHN3LXNpZGViYXItaG92ZXIscmdiYSgyNTUsMjU1LDI1NSwuMDYpKTtjb2xvcjp2YXIoLS1kc3ctc2lkZWJhci1mZy1hY3RpdmUsI2U2ZTlmMik7fVxuLnJjcC10cmlnZ2VyLWljb257Zm9udC1zaXplOjE1cHg7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7fVxuLnJjcC10cmlnZ2VyLWxhYmVse2ZvbnQtd2VpZ2h0OjUwMDt9XG4ucmNwLXRyaWdnZXItZG90e3Bvc2l0aW9uOmFic29sdXRlO3RvcDo0cHg7cmlnaHQ6NnB4O3dpZHRoOjdweDtoZWlnaHQ6N3B4O2JvcmRlci1yYWRpdXM6NTAlO1xuICBiYWNrZ3JvdW5kOiMzNGQzOTk7Ym94LXNoYWRvdzowIDAgNnB4IHJnYmEoNTIsMjExLDE1MywuOCk7fVxuLnJjcC1zdGF0ZXtwYWRkaW5nOjE4cHggOHB4O3RleHQtYWxpZ246Y2VudGVyO2NvbG9yOiM5YWEzYjg7Zm9udC1zaXplOjEzcHg7fVxuLnJjcC1lcnJvcntjb2xvcjojZmY2YjZiO31cbi5yY3AtYnRue21hcmdpbi10b3A6MTBweDtib3JkZXI6bm9uZTtib3JkZXItcmFkaXVzOjhweDtwYWRkaW5nOjdweCAxNnB4O2N1cnNvcjpwb2ludGVyO1xuICBiYWNrZ3JvdW5kOiMzYTViZDk7Y29sb3I6I2ZmZjtmb250LXNpemU6MTNweDt9XG4ucmNwLWJ0bjpkaXNhYmxlZHtvcGFjaXR5Oi41NTtjdXJzb3I6ZGVmYXVsdDt9XG4ucmNwLWJ0bi1naG9zdHtiYWNrZ3JvdW5kOnRyYW5zcGFyZW50O2NvbG9yOiM5YWEzYjg7Ym9yZGVyOjFweCBzb2xpZCAjMmEzMzQ4O31cbi5yY3AtYnRuLWdob3N0OmhvdmVye2NvbG9yOiNlNmU5ZjI7fVxuLnJjcC1wYWlye2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47YWxpZ24taXRlbXM6Y2VudGVyO2dhcDoxMnB4O3BhZGRpbmc6OHB4IDAgNHB4O31cbi5yY3AtcXJ7YmFja2dyb3VuZDojZmZmO2JvcmRlci1yYWRpdXM6MTJweDtwYWRkaW5nOjEycHg7bGluZS1oZWlnaHQ6MDt9XG4ucmNwLXFyIHN2Z3tkaXNwbGF5OmJsb2NrO3dpZHRoOjIwMHB4O2hlaWdodDoyMDBweDt9XG4ucmNwLXdhaXR7ZGlzcGxheTppbmxpbmUtZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtjb2xvcjojOWFhM2I4O2ZvbnQtc2l6ZToxM3B4O31cbi5yY3Atd2FpdC1kb3R7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojZjJjMTRlO2FuaW1hdGlvbjpyY3AtcHVsc2UgMS4ycyBlYXNlLWluLW91dCBpbmZpbml0ZTt9XG5Aa2V5ZnJhbWVzIHJjcC1wdWxzZXswJSwxMDAle29wYWNpdHk6LjM1fTUwJXtvcGFjaXR5OjF9fVxuLnJjcC1tZXRhe2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjE0cHg7Y29sb3I6IzZiNzI4MDtmb250LXNpemU6MTJweDtmbGV4LXdyYXA6d3JhcDtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO31cbi5yY3AtbWV0YS1pdGVte2Rpc3BsYXk6aW5saW5lLWZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo0cHg7fVxuLnJjcC1saW5re2JhY2tncm91bmQ6bm9uZTtib3JkZXI6bm9uZTtjb2xvcjojNmU5YmZmO2N1cnNvcjpwb2ludGVyO2ZvbnQtc2l6ZToxMnB4O3BhZGRpbmc6MDt9XG4ucmNwLWxpbms6aG92ZXJ7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZTt9XG4ucmNwLWNvbm5lY3RlZHtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6MTJweDtwYWRkaW5nOjE0cHggOHB4IDZweDt9XG4ucmNwLWNvbm5lY3RlZC1jaGVja3t3aWR0aDo1MnB4O2hlaWdodDo1MnB4O2JvcmRlci1yYWRpdXM6NTAlO2JhY2tncm91bmQ6cmdiYSg1MiwyMTEsMTUzLC4xNCk7XG4gIGNvbG9yOiMzNGQzOTk7Zm9udC1zaXplOjI2cHg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO31cbi5yY3AtY29ubmVjdGVkLXRpdGxle2ZvbnQtc2l6ZToxNnB4O2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjojZTZlOWYyO31cbi5yY3AtY29ubmVjdGVkLWRldmljZXN7ZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtnYXA6OHB4O3dpZHRoOjEwMCU7bWF4LXdpZHRoOjI2MHB4O31cbi5yY3AtZGV2aWNlLXJvd3tkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7YmFja2dyb3VuZDojMWUyNjM4O2JvcmRlci1yYWRpdXM6MTBweDtwYWRkaW5nOjEwcHggMTJweDt9XG4ucmNwLWRldmljZS1kb3R7d2lkdGg6OHB4O2hlaWdodDo4cHg7Ym9yZGVyLXJhZGl1czo1MCU7YmFja2dyb3VuZDojMzRkMzk5O2ZsZXg6bm9uZTt9XG4ucmNwLWRldmljZS1uYW1le2ZvbnQtc2l6ZToxM3B4O2ZvbnQtd2VpZ2h0OjYwMDtjb2xvcjojZTZlOWYyO31cbi5yY3AtZGV2aWNlLW1vZGVse2ZvbnQtc2l6ZToxMnB4O2NvbG9yOiM5YWEzYjg7bWFyZ2luLWxlZnQ6YXV0bzt9XG4ucmNwLWNvbm5lY3RlZC1oaW50e2ZvbnQtc2l6ZToxMnB4O2NvbG9yOiM2YjcyODA7fVxuYFxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQSwrRkFBQUEsU0FBQTtBQWlCQSxRQUFJQyxVQUFTLFdBQVc7QUFXdEIsVUFBSUEsVUFBUyxTQUFTLFlBQVksc0JBQXNCO0FBRXRELFlBQUksT0FBTztBQUNYLFlBQUksT0FBTztBQUVYLFlBQUksY0FBYztBQUNsQixZQUFJLHdCQUF3Qix1QkFBdUIsb0JBQW9CO0FBQ3ZFLFlBQUksV0FBVztBQUNmLFlBQUksZUFBZTtBQUNuQixZQUFJLGFBQWE7QUFDakIsWUFBSSxZQUFZLENBQUM7QUFFakIsWUFBSSxRQUFRLENBQUM7QUFFYixZQUFJLFdBQVcsU0FBUyxNQUFNLGFBQWE7QUFFekMseUJBQWUsY0FBYyxJQUFJO0FBQ2pDLHFCQUFXLFNBQVMsYUFBYTtBQUMvQixnQkFBSSxVQUFVLElBQUksTUFBTSxXQUFXO0FBQ25DLHFCQUFTLE1BQU0sR0FBRyxNQUFNLGFBQWEsT0FBTyxHQUFHO0FBQzdDLHNCQUFRLEdBQUcsSUFBSSxJQUFJLE1BQU0sV0FBVztBQUNwQyx1QkFBUyxNQUFNLEdBQUcsTUFBTSxhQUFhLE9BQU8sR0FBRztBQUM3Qyx3QkFBUSxHQUFHLEVBQUUsR0FBRyxJQUFJO0FBQUEsY0FDdEI7QUFBQSxZQUNGO0FBQ0EsbUJBQU87QUFBQSxVQUNULEVBQUUsWUFBWTtBQUVkLG9DQUEwQixHQUFHLENBQUM7QUFDOUIsb0NBQTBCLGVBQWUsR0FBRyxDQUFDO0FBQzdDLG9DQUEwQixHQUFHLGVBQWUsQ0FBQztBQUM3QyxxQ0FBMkI7QUFDM0IsNkJBQW1CO0FBQ25CLHdCQUFjLE1BQU0sV0FBVztBQUUvQixjQUFJLGVBQWUsR0FBRztBQUNwQiw0QkFBZ0IsSUFBSTtBQUFBLFVBQ3RCO0FBRUEsY0FBSSxjQUFjLE1BQU07QUFDdEIseUJBQWEsV0FBVyxhQUFhLHVCQUF1QixTQUFTO0FBQUEsVUFDdkU7QUFFQSxrQkFBUSxZQUFZLFdBQVc7QUFBQSxRQUNqQztBQUVBLFlBQUksNEJBQTRCLFNBQVMsS0FBSyxLQUFLO0FBRWpELG1CQUFTLElBQUksSUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBRS9CLGdCQUFJLE1BQU0sS0FBSyxNQUFNLGdCQUFnQixNQUFNLEVBQUc7QUFFOUMscUJBQVMsSUFBSSxJQUFJLEtBQUssR0FBRyxLQUFLLEdBQUc7QUFFL0Isa0JBQUksTUFBTSxLQUFLLE1BQU0sZ0JBQWdCLE1BQU0sRUFBRztBQUU5QyxrQkFBTSxLQUFLLEtBQUssS0FBSyxNQUFNLEtBQUssS0FBSyxLQUFLLE1BQ2xDLEtBQUssS0FBSyxLQUFLLE1BQU0sS0FBSyxLQUFLLEtBQUssTUFDcEMsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxHQUFLO0FBQzlDLHlCQUFTLE1BQU0sQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJO0FBQUEsY0FDL0IsT0FBTztBQUNMLHlCQUFTLE1BQU0sQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJO0FBQUEsY0FDL0I7QUFBQSxZQUNGO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFFQSxZQUFJLHFCQUFxQixXQUFXO0FBRWxDLGNBQUksZUFBZTtBQUNuQixjQUFJLFVBQVU7QUFFZCxtQkFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUssR0FBRztBQUU3QixxQkFBUyxNQUFNLENBQUM7QUFFaEIsZ0JBQUksWUFBWSxPQUFPLGFBQWEsS0FBSztBQUV6QyxnQkFBSSxLQUFLLEtBQUssZUFBZSxXQUFXO0FBQ3RDLDZCQUFlO0FBQ2Ysd0JBQVU7QUFBQSxZQUNaO0FBQUEsVUFDRjtBQUVBLGlCQUFPO0FBQUEsUUFDVDtBQUVBLFlBQUkscUJBQXFCLFdBQVc7QUFFbEMsbUJBQVMsSUFBSSxHQUFHLElBQUksZUFBZSxHQUFHLEtBQUssR0FBRztBQUM1QyxnQkFBSSxTQUFTLENBQUMsRUFBRSxDQUFDLEtBQUssTUFBTTtBQUMxQjtBQUFBLFlBQ0Y7QUFDQSxxQkFBUyxDQUFDLEVBQUUsQ0FBQyxJQUFLLElBQUksS0FBSztBQUFBLFVBQzdCO0FBRUEsbUJBQVMsSUFBSSxHQUFHLElBQUksZUFBZSxHQUFHLEtBQUssR0FBRztBQUM1QyxnQkFBSSxTQUFTLENBQUMsRUFBRSxDQUFDLEtBQUssTUFBTTtBQUMxQjtBQUFBLFlBQ0Y7QUFDQSxxQkFBUyxDQUFDLEVBQUUsQ0FBQyxJQUFLLElBQUksS0FBSztBQUFBLFVBQzdCO0FBQUEsUUFDRjtBQUVBLFlBQUksNkJBQTZCLFdBQVc7QUFFMUMsY0FBSSxNQUFNLE9BQU8sbUJBQW1CLFdBQVc7QUFFL0MsbUJBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxRQUFRLEtBQUssR0FBRztBQUV0QyxxQkFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLFFBQVEsS0FBSyxHQUFHO0FBRXRDLGtCQUFJLE1BQU0sSUFBSSxDQUFDO0FBQ2Ysa0JBQUksTUFBTSxJQUFJLENBQUM7QUFFZixrQkFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLEtBQUssTUFBTTtBQUM5QjtBQUFBLGNBQ0Y7QUFFQSx1QkFBUyxJQUFJLElBQUksS0FBSyxHQUFHLEtBQUssR0FBRztBQUUvQix5QkFBUyxJQUFJLElBQUksS0FBSyxHQUFHLEtBQUssR0FBRztBQUUvQixzQkFBSSxLQUFLLE1BQU0sS0FBSyxLQUFLLEtBQUssTUFBTSxLQUFLLEtBQ2pDLEtBQUssS0FBSyxLQUFLLEdBQUs7QUFDMUIsNkJBQVMsTUFBTSxDQUFDLEVBQUUsTUFBTSxDQUFDLElBQUk7QUFBQSxrQkFDL0IsT0FBTztBQUNMLDZCQUFTLE1BQU0sQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJO0FBQUEsa0JBQy9CO0FBQUEsZ0JBQ0Y7QUFBQSxjQUNGO0FBQUEsWUFDRjtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBRUEsWUFBSSxrQkFBa0IsU0FBUyxNQUFNO0FBRW5DLGNBQUksT0FBTyxPQUFPLGlCQUFpQixXQUFXO0FBRTlDLG1CQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSyxHQUFHO0FBQzlCLGdCQUFJLE1BQU8sQ0FBQyxTQUFXLFFBQVEsSUFBSyxNQUFNO0FBQzFDLHFCQUFTLEtBQUssTUFBTSxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksSUFBSSxlQUFlLElBQUksQ0FBQyxJQUFJO0FBQUEsVUFDOUQ7QUFFQSxtQkFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUssR0FBRztBQUM5QixnQkFBSSxNQUFPLENBQUMsU0FBVyxRQUFRLElBQUssTUFBTTtBQUMxQyxxQkFBUyxJQUFJLElBQUksZUFBZSxJQUFJLENBQUMsRUFBRSxLQUFLLE1BQU0sSUFBSSxDQUFDLENBQUMsSUFBSTtBQUFBLFVBQzlEO0FBQUEsUUFDRjtBQUVBLFlBQUksZ0JBQWdCLFNBQVMsTUFBTSxhQUFhO0FBRTlDLGNBQUksT0FBUSx5QkFBeUIsSUFBSztBQUMxQyxjQUFJLE9BQU8sT0FBTyxlQUFlLElBQUk7QUFHckMsbUJBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxLQUFLLEdBQUc7QUFFOUIsZ0JBQUksTUFBTyxDQUFDLFNBQVcsUUFBUSxJQUFLLE1BQU07QUFFMUMsZ0JBQUksSUFBSSxHQUFHO0FBQ1QsdUJBQVMsQ0FBQyxFQUFFLENBQUMsSUFBSTtBQUFBLFlBQ25CLFdBQVcsSUFBSSxHQUFHO0FBQ2hCLHVCQUFTLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTtBQUFBLFlBQ3ZCLE9BQU87QUFDTCx1QkFBUyxlQUFlLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSTtBQUFBLFlBQ3ZDO0FBQUEsVUFDRjtBQUdBLG1CQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSyxHQUFHO0FBRTlCLGdCQUFJLE1BQU8sQ0FBQyxTQUFXLFFBQVEsSUFBSyxNQUFNO0FBRTFDLGdCQUFJLElBQUksR0FBRztBQUNULHVCQUFTLENBQUMsRUFBRSxlQUFlLElBQUksQ0FBQyxJQUFJO0FBQUEsWUFDdEMsV0FBVyxJQUFJLEdBQUc7QUFDaEIsdUJBQVMsQ0FBQyxFQUFFLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSTtBQUFBLFlBQ2hDLE9BQU87QUFDTCx1QkFBUyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsSUFBSTtBQUFBLFlBQzVCO0FBQUEsVUFDRjtBQUdBLG1CQUFTLGVBQWUsQ0FBQyxFQUFFLENBQUMsSUFBSyxDQUFDO0FBQUEsUUFDcEM7QUFFQSxZQUFJLFVBQVUsU0FBUyxNQUFNLGFBQWE7QUFFeEMsY0FBSSxNQUFNO0FBQ1YsY0FBSSxNQUFNLGVBQWU7QUFDekIsY0FBSSxXQUFXO0FBQ2YsY0FBSSxZQUFZO0FBQ2hCLGNBQUksV0FBVyxPQUFPLGdCQUFnQixXQUFXO0FBRWpELG1CQUFTLE1BQU0sZUFBZSxHQUFHLE1BQU0sR0FBRyxPQUFPLEdBQUc7QUFFbEQsZ0JBQUksT0FBTyxFQUFHLFFBQU87QUFFckIsbUJBQU8sTUFBTTtBQUVYLHVCQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSyxHQUFHO0FBRTdCLG9CQUFJLFNBQVMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxLQUFLLE1BQU07QUFFbEMsc0JBQUksT0FBTztBQUVYLHNCQUFJLFlBQVksS0FBSyxRQUFRO0FBQzNCLDRCQUFZLEtBQUssU0FBUyxNQUFNLFdBQVksTUFBTTtBQUFBLGtCQUNwRDtBQUVBLHNCQUFJLE9BQU8sU0FBUyxLQUFLLE1BQU0sQ0FBQztBQUVoQyxzQkFBSSxNQUFNO0FBQ1IsMkJBQU8sQ0FBQztBQUFBLGtCQUNWO0FBRUEsMkJBQVMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxJQUFJO0FBQ3pCLDhCQUFZO0FBRVosc0JBQUksWUFBWSxJQUFJO0FBQ2xCLGlDQUFhO0FBQ2IsK0JBQVc7QUFBQSxrQkFDYjtBQUFBLGdCQUNGO0FBQUEsY0FDRjtBQUVBLHFCQUFPO0FBRVAsa0JBQUksTUFBTSxLQUFLLGdCQUFnQixLQUFLO0FBQ2xDLHVCQUFPO0FBQ1Asc0JBQU0sQ0FBQztBQUNQO0FBQUEsY0FDRjtBQUFBLFlBQ0Y7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUVBLFlBQUksY0FBYyxTQUFTLFFBQVEsVUFBVTtBQUUzQyxjQUFJLFNBQVM7QUFFYixjQUFJLGFBQWE7QUFDakIsY0FBSSxhQUFhO0FBRWpCLGNBQUksU0FBUyxJQUFJLE1BQU0sU0FBUyxNQUFNO0FBQ3RDLGNBQUksU0FBUyxJQUFJLE1BQU0sU0FBUyxNQUFNO0FBRXRDLG1CQUFTLElBQUksR0FBRyxJQUFJLFNBQVMsUUFBUSxLQUFLLEdBQUc7QUFFM0MsZ0JBQUksVUFBVSxTQUFTLENBQUMsRUFBRTtBQUMxQixnQkFBSSxVQUFVLFNBQVMsQ0FBQyxFQUFFLGFBQWE7QUFFdkMseUJBQWEsS0FBSyxJQUFJLFlBQVksT0FBTztBQUN6Qyx5QkFBYSxLQUFLLElBQUksWUFBWSxPQUFPO0FBRXpDLG1CQUFPLENBQUMsSUFBSSxJQUFJLE1BQU0sT0FBTztBQUU3QixxQkFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUMsRUFBRSxRQUFRLEtBQUssR0FBRztBQUM1QyxxQkFBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLE1BQU8sT0FBTyxVQUFVLEVBQUUsSUFBSSxNQUFNO0FBQUEsWUFDckQ7QUFDQSxzQkFBVTtBQUVWLGdCQUFJLFNBQVMsT0FBTywwQkFBMEIsT0FBTztBQUNyRCxnQkFBSSxVQUFVLGFBQWEsT0FBTyxDQUFDLEdBQUcsT0FBTyxVQUFVLElBQUksQ0FBQztBQUU1RCxnQkFBSSxVQUFVLFFBQVEsSUFBSSxNQUFNO0FBQ2hDLG1CQUFPLENBQUMsSUFBSSxJQUFJLE1BQU0sT0FBTyxVQUFVLElBQUksQ0FBQztBQUM1QyxxQkFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUMsRUFBRSxRQUFRLEtBQUssR0FBRztBQUM1QyxrQkFBSSxXQUFXLElBQUksUUFBUSxVQUFVLElBQUksT0FBTyxDQUFDLEVBQUU7QUFDbkQscUJBQU8sQ0FBQyxFQUFFLENBQUMsSUFBSyxZQUFZLElBQUksUUFBUSxNQUFNLFFBQVEsSUFBSTtBQUFBLFlBQzVEO0FBQUEsVUFDRjtBQUVBLGNBQUksaUJBQWlCO0FBQ3JCLG1CQUFTLElBQUksR0FBRyxJQUFJLFNBQVMsUUFBUSxLQUFLLEdBQUc7QUFDM0MsOEJBQWtCLFNBQVMsQ0FBQyxFQUFFO0FBQUEsVUFDaEM7QUFFQSxjQUFJLE9BQU8sSUFBSSxNQUFNLGNBQWM7QUFDbkMsY0FBSSxRQUFRO0FBRVosbUJBQVMsSUFBSSxHQUFHLElBQUksWUFBWSxLQUFLLEdBQUc7QUFDdEMscUJBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxRQUFRLEtBQUssR0FBRztBQUMzQyxrQkFBSSxJQUFJLE9BQU8sQ0FBQyxFQUFFLFFBQVE7QUFDeEIscUJBQUssS0FBSyxJQUFJLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFDekIseUJBQVM7QUFBQSxjQUNYO0FBQUEsWUFDRjtBQUFBLFVBQ0Y7QUFFQSxtQkFBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLEtBQUssR0FBRztBQUN0QyxxQkFBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLFFBQVEsS0FBSyxHQUFHO0FBQzNDLGtCQUFJLElBQUksT0FBTyxDQUFDLEVBQUUsUUFBUTtBQUN4QixxQkFBSyxLQUFLLElBQUksT0FBTyxDQUFDLEVBQUUsQ0FBQztBQUN6Qix5QkFBUztBQUFBLGNBQ1g7QUFBQSxZQUNGO0FBQUEsVUFDRjtBQUVBLGlCQUFPO0FBQUEsUUFDVDtBQUVBLFlBQUksYUFBYSxTQUFTQyxhQUFZQyx1QkFBc0IsVUFBVTtBQUVwRSxjQUFJLFdBQVcsVUFBVSxZQUFZRCxhQUFZQyxxQkFBb0I7QUFFckUsY0FBSSxTQUFTLFlBQVk7QUFFekIsbUJBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxRQUFRLEtBQUssR0FBRztBQUMzQyxnQkFBSSxPQUFPLFNBQVMsQ0FBQztBQUNyQixtQkFBTyxJQUFJLEtBQUssUUFBUSxHQUFHLENBQUM7QUFDNUIsbUJBQU8sSUFBSSxLQUFLLFVBQVUsR0FBRyxPQUFPLGdCQUFnQixLQUFLLFFBQVEsR0FBR0QsV0FBVSxDQUFFO0FBQ2hGLGlCQUFLLE1BQU0sTUFBTTtBQUFBLFVBQ25CO0FBR0EsY0FBSSxpQkFBaUI7QUFDckIsbUJBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxRQUFRLEtBQUssR0FBRztBQUMzQyw4QkFBa0IsU0FBUyxDQUFDLEVBQUU7QUFBQSxVQUNoQztBQUVBLGNBQUksT0FBTyxnQkFBZ0IsSUFBSSxpQkFBaUIsR0FBRztBQUNqRCxrQkFBTSw0QkFDRixPQUFPLGdCQUFnQixJQUN2QixNQUNBLGlCQUFpQixJQUNqQjtBQUFBLFVBQ047QUFHQSxjQUFJLE9BQU8sZ0JBQWdCLElBQUksS0FBSyxpQkFBaUIsR0FBRztBQUN0RCxtQkFBTyxJQUFJLEdBQUcsQ0FBQztBQUFBLFVBQ2pCO0FBR0EsaUJBQU8sT0FBTyxnQkFBZ0IsSUFBSSxLQUFLLEdBQUc7QUFDeEMsbUJBQU8sT0FBTyxLQUFLO0FBQUEsVUFDckI7QUFHQSxpQkFBTyxNQUFNO0FBRVgsZ0JBQUksT0FBTyxnQkFBZ0IsS0FBSyxpQkFBaUIsR0FBRztBQUNsRDtBQUFBLFlBQ0Y7QUFDQSxtQkFBTyxJQUFJLE1BQU0sQ0FBQztBQUVsQixnQkFBSSxPQUFPLGdCQUFnQixLQUFLLGlCQUFpQixHQUFHO0FBQ2xEO0FBQUEsWUFDRjtBQUNBLG1CQUFPLElBQUksTUFBTSxDQUFDO0FBQUEsVUFDcEI7QUFFQSxpQkFBTyxZQUFZLFFBQVEsUUFBUTtBQUFBLFFBQ3JDO0FBRUEsY0FBTSxVQUFVLFNBQVMsTUFBTSxNQUFNO0FBRW5DLGlCQUFPLFFBQVE7QUFFZixjQUFJLFVBQVU7QUFFZCxrQkFBTyxNQUFNO0FBQUEsWUFDYixLQUFLO0FBQ0gsd0JBQVUsU0FBUyxJQUFJO0FBQ3ZCO0FBQUEsWUFDRixLQUFLO0FBQ0gsd0JBQVUsV0FBVyxJQUFJO0FBQ3pCO0FBQUEsWUFDRixLQUFLO0FBQ0gsd0JBQVUsV0FBVyxJQUFJO0FBQ3pCO0FBQUEsWUFDRixLQUFLO0FBQ0gsd0JBQVUsUUFBUSxJQUFJO0FBQ3RCO0FBQUEsWUFDRjtBQUNFLG9CQUFNLFVBQVU7QUFBQSxVQUNsQjtBQUVBLG9CQUFVLEtBQUssT0FBTztBQUN0Qix1QkFBYTtBQUFBLFFBQ2Y7QUFFQSxjQUFNLFNBQVMsU0FBUyxLQUFLLEtBQUs7QUFDaEMsY0FBSSxNQUFNLEtBQUssZ0JBQWdCLE9BQU8sTUFBTSxLQUFLLGdCQUFnQixLQUFLO0FBQ3BFLGtCQUFNLE1BQU0sTUFBTTtBQUFBLFVBQ3BCO0FBQ0EsaUJBQU8sU0FBUyxHQUFHLEVBQUUsR0FBRztBQUFBLFFBQzFCO0FBRUEsY0FBTSxpQkFBaUIsV0FBVztBQUNoQyxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxjQUFNLE9BQU8sV0FBVztBQUN0QixjQUFJLGNBQWMsR0FBRztBQUNuQixnQkFBSUEsY0FBYTtBQUVqQixtQkFBT0EsY0FBYSxJQUFJQSxlQUFjO0FBQ3BDLGtCQUFJLFdBQVcsVUFBVSxZQUFZQSxhQUFZLHFCQUFxQjtBQUN0RSxrQkFBSSxTQUFTLFlBQVk7QUFFekIsdUJBQVMsSUFBSSxHQUFHLElBQUksVUFBVSxRQUFRLEtBQUs7QUFDekMsb0JBQUksT0FBTyxVQUFVLENBQUM7QUFDdEIsdUJBQU8sSUFBSSxLQUFLLFFBQVEsR0FBRyxDQUFDO0FBQzVCLHVCQUFPLElBQUksS0FBSyxVQUFVLEdBQUcsT0FBTyxnQkFBZ0IsS0FBSyxRQUFRLEdBQUdBLFdBQVUsQ0FBRTtBQUNoRixxQkFBSyxNQUFNLE1BQU07QUFBQSxjQUNuQjtBQUVBLGtCQUFJLGlCQUFpQjtBQUNyQix1QkFBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLFFBQVEsS0FBSztBQUN4QyxrQ0FBa0IsU0FBUyxDQUFDLEVBQUU7QUFBQSxjQUNoQztBQUVBLGtCQUFJLE9BQU8sZ0JBQWdCLEtBQUssaUJBQWlCLEdBQUc7QUFDbEQ7QUFBQSxjQUNGO0FBQUEsWUFDRjtBQUVBLDBCQUFjQTtBQUFBLFVBQ2hCO0FBRUEsbUJBQVMsT0FBTyxtQkFBbUIsQ0FBRTtBQUFBLFFBQ3ZDO0FBRUEsY0FBTSxpQkFBaUIsU0FBUyxVQUFVLFFBQVE7QUFFaEQscUJBQVcsWUFBWTtBQUN2QixtQkFBVSxPQUFPLFVBQVUsY0FBYyxXQUFXLElBQUk7QUFFeEQsY0FBSSxTQUFTO0FBRWIsb0JBQVU7QUFDVixvQkFBVTtBQUNWLG9CQUFVO0FBQ1Ysb0JBQVUsNEJBQTRCLFNBQVM7QUFDL0Msb0JBQVU7QUFDVixvQkFBVTtBQUVWLG1CQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sZUFBZSxHQUFHLEtBQUssR0FBRztBQUVsRCxzQkFBVTtBQUVWLHFCQUFTLElBQUksR0FBRyxJQUFJLE1BQU0sZUFBZSxHQUFHLEtBQUssR0FBRztBQUNsRCx3QkFBVTtBQUNWLHdCQUFVO0FBQ1Ysd0JBQVU7QUFDVix3QkFBVTtBQUNWLHdCQUFVLGFBQWEsV0FBVztBQUNsQyx3QkFBVSxjQUFjLFdBQVc7QUFDbkMsd0JBQVU7QUFDVix3QkFBVSxNQUFNLE9BQU8sR0FBRyxDQUFDLElBQUcsWUFBWTtBQUMxQyx3QkFBVTtBQUNWLHdCQUFVO0FBQUEsWUFDWjtBQUVBLHNCQUFVO0FBQUEsVUFDWjtBQUVBLG9CQUFVO0FBQ1Ysb0JBQVU7QUFFVixpQkFBTztBQUFBLFFBQ1Q7QUFFQSxjQUFNLGVBQWUsU0FBUyxVQUFVLFFBQVEsS0FBSyxPQUFPO0FBRTFELGNBQUksT0FBTyxDQUFDO0FBQ1osY0FBSSxPQUFPLFVBQVUsQ0FBQyxLQUFLLFVBQVU7QUFFbkMsbUJBQU8sVUFBVSxDQUFDO0FBRWxCLHVCQUFXLEtBQUs7QUFDaEIscUJBQVMsS0FBSztBQUNkLGtCQUFNLEtBQUs7QUFDWCxvQkFBUSxLQUFLO0FBQUEsVUFDZjtBQUVBLHFCQUFXLFlBQVk7QUFDdkIsbUJBQVUsT0FBTyxVQUFVLGNBQWMsV0FBVyxJQUFJO0FBR3hELGdCQUFPLE9BQU8sUUFBUSxXQUFZLEVBQUMsTUFBTSxJQUFHLElBQUksT0FBTyxDQUFDO0FBQ3hELGNBQUksT0FBTyxJQUFJLFFBQVE7QUFDdkIsY0FBSSxLQUFNLElBQUksT0FBUSxJQUFJLE1BQU0sdUJBQXVCO0FBR3ZELGtCQUFTLE9BQU8sVUFBVSxXQUFZLEVBQUMsTUFBTSxNQUFLLElBQUksU0FBUyxDQUFDO0FBQ2hFLGdCQUFNLE9BQU8sTUFBTSxRQUFRO0FBQzNCLGdCQUFNLEtBQU0sTUFBTSxPQUFRLE1BQU0sTUFBTSxpQkFBaUI7QUFFdkQsY0FBSSxPQUFPLE1BQU0sZUFBZSxJQUFJLFdBQVcsU0FBUztBQUN4RCxjQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksUUFBTSxJQUFJO0FBRTVCLGlCQUFPLE1BQU0sV0FBVyxVQUFVLFdBQ2hDLE9BQU8sV0FBVyxXQUFXLFdBQVc7QUFFMUMsbUJBQVM7QUFDVCxtQkFBUyxDQUFDLEtBQUssV0FBVyxhQUFhLE9BQU8saUJBQWlCLE9BQU8sUUFBUTtBQUM5RSxtQkFBUyxtQkFBbUIsT0FBTyxNQUFNLE9BQU87QUFDaEQsbUJBQVM7QUFDVCxtQkFBVSxNQUFNLFFBQVEsSUFBSSxPQUFRLGtDQUNoQyxVQUFVLENBQUMsTUFBTSxJQUFJLElBQUksRUFBRSxFQUFFLEtBQUssR0FBRyxFQUFFLEtBQUssQ0FBRSxJQUFJLE1BQU07QUFDNUQsbUJBQVM7QUFDVCxtQkFBVSxNQUFNLE9BQVEsZ0JBQWdCLFVBQVUsTUFBTSxFQUFFLElBQUksT0FDMUQsVUFBVSxNQUFNLElBQUksSUFBSSxhQUFhO0FBQ3pDLG1CQUFVLElBQUksT0FBUSxzQkFBc0IsVUFBVSxJQUFJLEVBQUUsSUFBSSxPQUM1RCxVQUFVLElBQUksSUFBSSxJQUFJLG1CQUFtQjtBQUM3QyxtQkFBUztBQUNULG1CQUFTO0FBRVQsZUFBSyxJQUFJLEdBQUcsSUFBSSxNQUFNLGVBQWUsR0FBRyxLQUFLLEdBQUc7QUFDOUMsaUJBQUssSUFBSSxXQUFXO0FBQ3BCLGlCQUFLLElBQUksR0FBRyxJQUFJLE1BQU0sZUFBZSxHQUFHLEtBQUssR0FBRztBQUM5QyxrQkFBSSxNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUk7QUFDdkIscUJBQUssSUFBRSxXQUFTO0FBQ2hCLHlCQUFTLE1BQU0sS0FBSyxNQUFNLEtBQUs7QUFBQSxjQUNqQztBQUFBLFlBQ0Y7QUFBQSxVQUNGO0FBRUEsbUJBQVM7QUFDVCxtQkFBUztBQUVULGlCQUFPO0FBQUEsUUFDVDtBQUVBLGNBQU0sZ0JBQWdCLFNBQVMsVUFBVSxRQUFRO0FBRS9DLHFCQUFXLFlBQVk7QUFDdkIsbUJBQVUsT0FBTyxVQUFVLGNBQWMsV0FBVyxJQUFJO0FBRXhELGNBQUksT0FBTyxNQUFNLGVBQWUsSUFBSSxXQUFXLFNBQVM7QUFDeEQsY0FBSSxNQUFNO0FBQ1YsY0FBSSxNQUFNLE9BQU87QUFFakIsaUJBQU8sY0FBYyxNQUFNLE1BQU0sU0FBUyxHQUFHLEdBQUc7QUFDOUMsZ0JBQUksT0FBTyxLQUFLLElBQUksT0FBTyxPQUFPLEtBQUssSUFBSSxLQUFLO0FBQzlDLGtCQUFJLElBQUksS0FBSyxPQUFRLElBQUksT0FBTyxRQUFRO0FBQ3hDLGtCQUFJLElBQUksS0FBSyxPQUFRLElBQUksT0FBTyxRQUFRO0FBQ3hDLHFCQUFPLE1BQU0sT0FBTyxHQUFHLENBQUMsSUFBRyxJQUFJO0FBQUEsWUFDakMsT0FBTztBQUNMLHFCQUFPO0FBQUEsWUFDVDtBQUFBLFVBQ0YsQ0FBRTtBQUFBLFFBQ0o7QUFFQSxjQUFNLGVBQWUsU0FBUyxVQUFVLFFBQVEsS0FBSztBQUVuRCxxQkFBVyxZQUFZO0FBQ3ZCLG1CQUFVLE9BQU8sVUFBVSxjQUFjLFdBQVcsSUFBSTtBQUV4RCxjQUFJLE9BQU8sTUFBTSxlQUFlLElBQUksV0FBVyxTQUFTO0FBRXhELGNBQUksTUFBTTtBQUNWLGlCQUFPO0FBQ1AsaUJBQU87QUFDUCxpQkFBTyxNQUFNLGNBQWMsVUFBVSxNQUFNO0FBQzNDLGlCQUFPO0FBQ1AsaUJBQU87QUFDUCxpQkFBTztBQUNQLGlCQUFPO0FBQ1AsaUJBQU87QUFDUCxpQkFBTztBQUNQLGlCQUFPO0FBQ1AsY0FBSSxLQUFLO0FBQ1AsbUJBQU87QUFDUCxtQkFBTyxVQUFVLEdBQUc7QUFDcEIsbUJBQU87QUFBQSxVQUNUO0FBQ0EsaUJBQU87QUFFUCxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxZQUFJLFlBQVksU0FBUyxHQUFHO0FBQzFCLGNBQUksVUFBVTtBQUNkLG1CQUFTLElBQUksR0FBRyxJQUFJLEVBQUUsUUFBUSxLQUFLLEdBQUc7QUFDcEMsZ0JBQUksSUFBSSxFQUFFLE9BQU8sQ0FBQztBQUNsQixvQkFBTyxHQUFHO0FBQUEsY0FDVixLQUFLO0FBQUssMkJBQVc7QUFBUTtBQUFBLGNBQzdCLEtBQUs7QUFBSywyQkFBVztBQUFRO0FBQUEsY0FDN0IsS0FBSztBQUFLLDJCQUFXO0FBQVM7QUFBQSxjQUM5QixLQUFLO0FBQUssMkJBQVc7QUFBVTtBQUFBLGNBQy9CO0FBQVUsMkJBQVc7QUFBRztBQUFBLFlBQ3hCO0FBQUEsVUFDRjtBQUNBLGlCQUFPO0FBQUEsUUFDVDtBQUVBLFlBQUksbUJBQW1CLFNBQVMsUUFBUTtBQUN0QyxjQUFJLFdBQVc7QUFDZixtQkFBVSxPQUFPLFVBQVUsY0FBYyxXQUFXLElBQUk7QUFFeEQsY0FBSSxPQUFPLE1BQU0sZUFBZSxJQUFJLFdBQVcsU0FBUztBQUN4RCxjQUFJLE1BQU07QUFDVixjQUFJLE1BQU0sT0FBTztBQUVqQixjQUFJLEdBQUcsR0FBRyxJQUFJLElBQUk7QUFFbEIsY0FBSSxTQUFTO0FBQUEsWUFDWCxnQkFBTTtBQUFBLFlBQ04sV0FBTTtBQUFBLFlBQ04sV0FBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFVBQ1I7QUFFQSxjQUFJLHlCQUF5QjtBQUFBLFlBQzNCLGdCQUFNO0FBQUEsWUFDTixXQUFNO0FBQUEsWUFDTixXQUFNO0FBQUEsWUFDTixNQUFNO0FBQUEsVUFDUjtBQUVBLGNBQUksUUFBUTtBQUNaLGVBQUssSUFBSSxHQUFHLElBQUksTUFBTSxLQUFLLEdBQUc7QUFDNUIsaUJBQUssS0FBSyxPQUFPLElBQUksT0FBTyxRQUFRO0FBQ3BDLGlCQUFLLEtBQUssT0FBTyxJQUFJLElBQUksT0FBTyxRQUFRO0FBQ3hDLGlCQUFLLElBQUksR0FBRyxJQUFJLE1BQU0sS0FBSyxHQUFHO0FBQzVCLGtCQUFJO0FBRUosa0JBQUksT0FBTyxLQUFLLElBQUksT0FBTyxPQUFPLEtBQUssSUFBSSxPQUFPLE1BQU0sT0FBTyxJQUFJLEtBQUssT0FBTyxJQUFJLE9BQU8sUUFBUSxDQUFDLEdBQUc7QUFDcEcsb0JBQUk7QUFBQSxjQUNOO0FBRUEsa0JBQUksT0FBTyxLQUFLLElBQUksT0FBTyxPQUFPLElBQUUsS0FBSyxJQUFFLElBQUksT0FBTyxNQUFNLE9BQU8sSUFBSSxLQUFLLE9BQU8sSUFBSSxPQUFPLFFBQVEsQ0FBQyxHQUFHO0FBQ3hHLHFCQUFLO0FBQUEsY0FDUCxPQUNLO0FBQ0gscUJBQUs7QUFBQSxjQUNQO0FBR0EsdUJBQVUsU0FBUyxLQUFLLElBQUUsS0FBSyxNQUFPLHVCQUF1QixDQUFDLElBQUksT0FBTyxDQUFDO0FBQUEsWUFDNUU7QUFFQSxxQkFBUztBQUFBLFVBQ1g7QUFFQSxjQUFJLE9BQU8sS0FBSyxTQUFTLEdBQUc7QUFDMUIsbUJBQU8sTUFBTSxVQUFVLEdBQUcsTUFBTSxTQUFTLE9BQU8sQ0FBQyxJQUFJLE1BQU0sT0FBSyxDQUFDLEVBQUUsS0FBSyxRQUFHO0FBQUEsVUFDN0U7QUFFQSxpQkFBTyxNQUFNLFVBQVUsR0FBRyxNQUFNLFNBQU8sQ0FBQztBQUFBLFFBQzFDO0FBRUEsY0FBTSxjQUFjLFNBQVMsVUFBVSxRQUFRO0FBQzdDLHFCQUFXLFlBQVk7QUFFdkIsY0FBSSxXQUFXLEdBQUc7QUFDaEIsbUJBQU8saUJBQWlCLE1BQU07QUFBQSxVQUNoQztBQUVBLHNCQUFZO0FBQ1osbUJBQVUsT0FBTyxVQUFVLGNBQWMsV0FBVyxJQUFJO0FBRXhELGNBQUksT0FBTyxNQUFNLGVBQWUsSUFBSSxXQUFXLFNBQVM7QUFDeEQsY0FBSSxNQUFNO0FBQ1YsY0FBSSxNQUFNLE9BQU87QUFFakIsY0FBSSxHQUFHLEdBQUcsR0FBRztBQUViLGNBQUksUUFBUSxNQUFNLFdBQVMsQ0FBQyxFQUFFLEtBQUssY0FBSTtBQUN2QyxjQUFJLFFBQVEsTUFBTSxXQUFTLENBQUMsRUFBRSxLQUFLLElBQUk7QUFFdkMsY0FBSSxRQUFRO0FBQ1osY0FBSSxPQUFPO0FBQ1gsZUFBSyxJQUFJLEdBQUcsSUFBSSxNQUFNLEtBQUssR0FBRztBQUM1QixnQkFBSSxLQUFLLE9BQVEsSUFBSSxPQUFPLFFBQVE7QUFDcEMsbUJBQU87QUFDUCxpQkFBSyxJQUFJLEdBQUcsSUFBSSxNQUFNLEtBQUssR0FBRztBQUM1QixrQkFBSTtBQUVKLGtCQUFJLE9BQU8sS0FBSyxJQUFJLE9BQU8sT0FBTyxLQUFLLElBQUksT0FBTyxNQUFNLE9BQU8sR0FBRyxLQUFLLE9BQU8sSUFBSSxPQUFPLFFBQVEsQ0FBQyxHQUFHO0FBQ25HLG9CQUFJO0FBQUEsY0FDTjtBQUdBLHNCQUFRLElBQUksUUFBUTtBQUFBLFlBQ3RCO0FBRUEsaUJBQUssSUFBSSxHQUFHLElBQUksVUFBVSxLQUFLLEdBQUc7QUFDaEMsdUJBQVMsT0FBTztBQUFBLFlBQ2xCO0FBQUEsVUFDRjtBQUVBLGlCQUFPLE1BQU0sVUFBVSxHQUFHLE1BQU0sU0FBTyxDQUFDO0FBQUEsUUFDMUM7QUFFQSxjQUFNLG9CQUFvQixTQUFTLFNBQVMsVUFBVTtBQUNwRCxxQkFBVyxZQUFZO0FBQ3ZCLGNBQUksU0FBUyxNQUFNLGVBQWU7QUFDbEMsbUJBQVMsTUFBTSxHQUFHLE1BQU0sUUFBUSxPQUFPO0FBQ3JDLHFCQUFTLE1BQU0sR0FBRyxNQUFNLFFBQVEsT0FBTztBQUNyQyxzQkFBUSxZQUFZLE1BQU0sT0FBTyxLQUFLLEdBQUcsSUFBSSxVQUFVO0FBQ3ZELHNCQUFRLFNBQVMsTUFBTSxVQUFVLE1BQU0sVUFBVSxVQUFVLFFBQVE7QUFBQSxZQUNyRTtBQUFBLFVBQ0Y7QUFBQSxRQUNGO0FBRUEsZUFBTztBQUFBLE1BQ1Q7QUFNQSxNQUFBRCxRQUFPLHFCQUFxQjtBQUFBLFFBQzFCLFdBQVksU0FBUyxHQUFHO0FBQ3RCLGNBQUksUUFBUSxDQUFDO0FBQ2IsbUJBQVMsSUFBSSxHQUFHLElBQUksRUFBRSxRQUFRLEtBQUssR0FBRztBQUNwQyxnQkFBSSxJQUFJLEVBQUUsV0FBVyxDQUFDO0FBQ3RCLGtCQUFNLEtBQUssSUFBSSxHQUFJO0FBQUEsVUFDckI7QUFDQSxpQkFBTztBQUFBLFFBQ1Q7QUFBQSxNQUNGO0FBRUEsTUFBQUEsUUFBTyxnQkFBZ0JBLFFBQU8sbUJBQW1CLFNBQVM7QUFXMUQsTUFBQUEsUUFBTyxzQkFBc0IsU0FBUyxhQUFhLFVBQVU7QUFJM0QsWUFBSSxhQUFhLFdBQVc7QUFFMUIsY0FBSSxNQUFNLHdCQUF3QixXQUFXO0FBQzdDLGNBQUksT0FBTyxXQUFXO0FBQ3BCLGdCQUFJLElBQUksSUFBSSxLQUFLO0FBQ2pCLGdCQUFJLEtBQUssR0FBSSxPQUFNO0FBQ25CLG1CQUFPO0FBQUEsVUFDVDtBQUVBLGNBQUksUUFBUTtBQUNaLGNBQUlHLGNBQWEsQ0FBQztBQUNsQixpQkFBTyxNQUFNO0FBQ1gsZ0JBQUksS0FBSyxJQUFJLEtBQUs7QUFDbEIsZ0JBQUksTUFBTSxHQUFJO0FBQ2QsZ0JBQUksS0FBSyxLQUFLO0FBQ2QsZ0JBQUksS0FBSyxLQUFLO0FBQ2QsZ0JBQUksS0FBSyxLQUFLO0FBQ2QsZ0JBQUksSUFBSSxPQUFPLGFBQWUsTUFBTSxJQUFLLEVBQUU7QUFDM0MsZ0JBQUksSUFBSyxNQUFNLElBQUs7QUFDcEIsWUFBQUEsWUFBVyxDQUFDLElBQUk7QUFDaEIscUJBQVM7QUFBQSxVQUNYO0FBQ0EsY0FBSSxTQUFTLFVBQVU7QUFDckIsa0JBQU0sUUFBUSxTQUFTO0FBQUEsVUFDekI7QUFFQSxpQkFBT0E7QUFBQSxRQUNULEVBQUU7QUFFRixZQUFJLGNBQWMsSUFBSSxXQUFXLENBQUM7QUFFbEMsZUFBTyxTQUFTLEdBQUc7QUFDakIsY0FBSSxRQUFRLENBQUM7QUFDYixtQkFBUyxJQUFJLEdBQUcsSUFBSSxFQUFFLFFBQVEsS0FBSyxHQUFHO0FBQ3BDLGdCQUFJLElBQUksRUFBRSxXQUFXLENBQUM7QUFDdEIsZ0JBQUksSUFBSSxLQUFLO0FBQ1gsb0JBQU0sS0FBSyxDQUFDO0FBQUEsWUFDZCxPQUFPO0FBQ0wsa0JBQUksSUFBSSxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDOUIsa0JBQUksT0FBTyxLQUFLLFVBQVU7QUFDeEIscUJBQU0sSUFBSSxRQUFTLEdBQUc7QUFFcEIsd0JBQU0sS0FBSyxDQUFDO0FBQUEsZ0JBQ2QsT0FBTztBQUVMLHdCQUFNLEtBQUssTUFBTSxDQUFDO0FBQ2xCLHdCQUFNLEtBQUssSUFBSSxHQUFJO0FBQUEsZ0JBQ3JCO0FBQUEsY0FDRixPQUFPO0FBQ0wsc0JBQU0sS0FBSyxXQUFXO0FBQUEsY0FDeEI7QUFBQSxZQUNGO0FBQUEsVUFDRjtBQUNBLGlCQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFNQSxVQUFJLFNBQVM7QUFBQSxRQUNYLGFBQWlCLEtBQUs7QUFBQSxRQUN0QixnQkFBaUIsS0FBSztBQUFBLFFBQ3RCLGdCQUFpQixLQUFLO0FBQUEsUUFDdEIsWUFBaUIsS0FBSztBQUFBLE1BQ3hCO0FBTUEsVUFBSSx5QkFBeUI7QUFBQSxRQUMzQixHQUFJO0FBQUEsUUFDSixHQUFJO0FBQUEsUUFDSixHQUFJO0FBQUEsUUFDSixHQUFJO0FBQUEsTUFDTjtBQU1BLFVBQUksZ0JBQWdCO0FBQUEsUUFDbEIsWUFBYTtBQUFBLFFBQ2IsWUFBYTtBQUFBLFFBQ2IsWUFBYTtBQUFBLFFBQ2IsWUFBYTtBQUFBLFFBQ2IsWUFBYTtBQUFBLFFBQ2IsWUFBYTtBQUFBLFFBQ2IsWUFBYTtBQUFBLFFBQ2IsWUFBYTtBQUFBLE1BQ2Y7QUFNQSxVQUFJLFNBQVMsV0FBVztBQUV0QixZQUFJLHlCQUF5QjtBQUFBLFVBQzNCLENBQUM7QUFBQSxVQUNELENBQUMsR0FBRyxFQUFFO0FBQUEsVUFDTixDQUFDLEdBQUcsRUFBRTtBQUFBLFVBQ04sQ0FBQyxHQUFHLEVBQUU7QUFBQSxVQUNOLENBQUMsR0FBRyxFQUFFO0FBQUEsVUFDTixDQUFDLEdBQUcsRUFBRTtBQUFBLFVBQ04sQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDZCxDQUFDLEdBQUcsSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUNkLENBQUMsR0FBRyxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ2QsQ0FBQyxHQUFHLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDZCxDQUFDLEdBQUcsSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUNkLENBQUMsR0FBRyxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ2QsQ0FBQyxHQUFHLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDZCxDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ2xCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDbEIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLEdBQUc7QUFBQSxVQUNuQixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksR0FBRztBQUFBLFVBQ25CLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxHQUFHO0FBQUEsVUFDbkIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLEdBQUc7QUFBQSxVQUNuQixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksR0FBRztBQUFBLFVBQ25CLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEdBQUc7QUFBQSxVQUN2QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxHQUFHO0FBQUEsVUFDeEIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLEtBQUssR0FBRztBQUFBLFVBQ3hCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxLQUFLLEdBQUc7QUFBQSxVQUN4QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxHQUFHO0FBQUEsVUFDeEIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLEtBQUssR0FBRztBQUFBLFVBQ3hCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxLQUFLLEdBQUc7QUFBQSxVQUN4QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxLQUFLLEdBQUc7QUFBQSxVQUM3QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxLQUFLLEdBQUc7QUFBQSxVQUM3QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxLQUFLLEdBQUc7QUFBQSxVQUM3QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxLQUFLLEdBQUc7QUFBQSxVQUM3QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxLQUFLLEdBQUc7QUFBQSxVQUM3QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksS0FBSyxLQUFLLEdBQUc7QUFBQSxRQUMvQjtBQUNBLFlBQUksTUFBTyxLQUFLLEtBQU8sS0FBSyxJQUFNLEtBQUssSUFBTSxLQUFLLElBQU0sS0FBSyxJQUFNLEtBQUssSUFBTSxLQUFLO0FBQ25GLFlBQUksTUFBTyxLQUFLLEtBQU8sS0FBSyxLQUFPLEtBQUssS0FBTyxLQUFLLElBQU0sS0FBSyxJQUFNLEtBQUssSUFBTSxLQUFLLElBQU0sS0FBSztBQUNoRyxZQUFJLFdBQVksS0FBSyxLQUFPLEtBQUssS0FBTyxLQUFLLEtBQU8sS0FBSyxJQUFNLEtBQUs7QUFFcEUsWUFBSSxRQUFRLENBQUM7QUFFYixZQUFJLGNBQWMsU0FBUyxNQUFNO0FBQy9CLGNBQUksUUFBUTtBQUNaLGlCQUFPLFFBQVEsR0FBRztBQUNoQixxQkFBUztBQUNULHNCQUFVO0FBQUEsVUFDWjtBQUNBLGlCQUFPO0FBQUEsUUFDVDtBQUVBLGNBQU0saUJBQWlCLFNBQVMsTUFBTTtBQUNwQyxjQUFJLElBQUksUUFBUTtBQUNoQixpQkFBTyxZQUFZLENBQUMsSUFBSSxZQUFZLEdBQUcsS0FBSyxHQUFHO0FBQzdDLGlCQUFNLE9BQVEsWUFBWSxDQUFDLElBQUksWUFBWSxHQUFHO0FBQUEsVUFDaEQ7QUFDQSxrQkFBVSxRQUFRLEtBQU0sS0FBSztBQUFBLFFBQy9CO0FBRUEsY0FBTSxtQkFBbUIsU0FBUyxNQUFNO0FBQ3RDLGNBQUksSUFBSSxRQUFRO0FBQ2hCLGlCQUFPLFlBQVksQ0FBQyxJQUFJLFlBQVksR0FBRyxLQUFLLEdBQUc7QUFDN0MsaUJBQU0sT0FBUSxZQUFZLENBQUMsSUFBSSxZQUFZLEdBQUc7QUFBQSxVQUNoRDtBQUNBLGlCQUFRLFFBQVEsS0FBTTtBQUFBLFFBQ3hCO0FBRUEsY0FBTSxxQkFBcUIsU0FBUyxZQUFZO0FBQzlDLGlCQUFPLHVCQUF1QixhQUFhLENBQUM7QUFBQSxRQUM5QztBQUVBLGNBQU0sa0JBQWtCLFNBQVMsYUFBYTtBQUU1QyxrQkFBUSxhQUFhO0FBQUEsWUFFckIsS0FBSyxjQUFjO0FBQ2pCLHFCQUFPLFNBQVMsR0FBRyxHQUFHO0FBQUUsd0JBQVEsSUFBSSxLQUFLLEtBQUs7QUFBQSxjQUFHO0FBQUEsWUFDbkQsS0FBSyxjQUFjO0FBQ2pCLHFCQUFPLFNBQVMsR0FBRyxHQUFHO0FBQUUsdUJBQU8sSUFBSSxLQUFLO0FBQUEsY0FBRztBQUFBLFlBQzdDLEtBQUssY0FBYztBQUNqQixxQkFBTyxTQUFTLEdBQUcsR0FBRztBQUFFLHVCQUFPLElBQUksS0FBSztBQUFBLGNBQUc7QUFBQSxZQUM3QyxLQUFLLGNBQWM7QUFDakIscUJBQU8sU0FBUyxHQUFHLEdBQUc7QUFBRSx3QkFBUSxJQUFJLEtBQUssS0FBSztBQUFBLGNBQUc7QUFBQSxZQUNuRCxLQUFLLGNBQWM7QUFDakIscUJBQU8sU0FBUyxHQUFHLEdBQUc7QUFBRSx3QkFBUSxLQUFLLE1BQU0sSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLElBQUksQ0FBQyxLQUFNLEtBQUs7QUFBQSxjQUFHO0FBQUEsWUFDcEYsS0FBSyxjQUFjO0FBQ2pCLHFCQUFPLFNBQVMsR0FBRyxHQUFHO0FBQUUsdUJBQVEsSUFBSSxJQUFLLElBQUssSUFBSSxJQUFLLEtBQUs7QUFBQSxjQUFHO0FBQUEsWUFDakUsS0FBSyxjQUFjO0FBQ2pCLHFCQUFPLFNBQVMsR0FBRyxHQUFHO0FBQUUsd0JBQVUsSUFBSSxJQUFLLElBQUssSUFBSSxJQUFLLEtBQUssS0FBSztBQUFBLGNBQUc7QUFBQSxZQUN4RSxLQUFLLGNBQWM7QUFDakIscUJBQU8sU0FBUyxHQUFHLEdBQUc7QUFBRSx3QkFBVSxJQUFJLElBQUssS0FBSyxJQUFJLEtBQUssS0FBSyxLQUFLO0FBQUEsY0FBRztBQUFBLFlBRXhFO0FBQ0Usb0JBQU0scUJBQXFCO0FBQUEsVUFDN0I7QUFBQSxRQUNGO0FBRUEsY0FBTSw0QkFBNEIsU0FBUyxvQkFBb0I7QUFDN0QsY0FBSSxJQUFJLGFBQWEsQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUMzQixtQkFBUyxJQUFJLEdBQUcsSUFBSSxvQkFBb0IsS0FBSyxHQUFHO0FBQzlDLGdCQUFJLEVBQUUsU0FBUyxhQUFhLENBQUMsR0FBRyxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFFO0FBQUEsVUFDdEQ7QUFDQSxpQkFBTztBQUFBLFFBQ1Q7QUFFQSxjQUFNLGtCQUFrQixTQUFTLE1BQU0sTUFBTTtBQUUzQyxjQUFJLEtBQUssUUFBUSxPQUFPLElBQUk7QUFJMUIsb0JBQU8sTUFBTTtBQUFBLGNBQ2IsS0FBSyxPQUFPO0FBQWlCLHVCQUFPO0FBQUEsY0FDcEMsS0FBSyxPQUFPO0FBQWlCLHVCQUFPO0FBQUEsY0FDcEMsS0FBSyxPQUFPO0FBQWlCLHVCQUFPO0FBQUEsY0FDcEMsS0FBSyxPQUFPO0FBQWlCLHVCQUFPO0FBQUEsY0FDcEM7QUFDRSxzQkFBTSxVQUFVO0FBQUEsWUFDbEI7QUFBQSxVQUVGLFdBQVcsT0FBTyxJQUFJO0FBSXBCLG9CQUFPLE1BQU07QUFBQSxjQUNiLEtBQUssT0FBTztBQUFpQix1QkFBTztBQUFBLGNBQ3BDLEtBQUssT0FBTztBQUFpQix1QkFBTztBQUFBLGNBQ3BDLEtBQUssT0FBTztBQUFpQix1QkFBTztBQUFBLGNBQ3BDLEtBQUssT0FBTztBQUFpQix1QkFBTztBQUFBLGNBQ3BDO0FBQ0Usc0JBQU0sVUFBVTtBQUFBLFlBQ2xCO0FBQUEsVUFFRixXQUFXLE9BQU8sSUFBSTtBQUlwQixvQkFBTyxNQUFNO0FBQUEsY0FDYixLQUFLLE9BQU87QUFBaUIsdUJBQU87QUFBQSxjQUNwQyxLQUFLLE9BQU87QUFBaUIsdUJBQU87QUFBQSxjQUNwQyxLQUFLLE9BQU87QUFBaUIsdUJBQU87QUFBQSxjQUNwQyxLQUFLLE9BQU87QUFBaUIsdUJBQU87QUFBQSxjQUNwQztBQUNFLHNCQUFNLFVBQVU7QUFBQSxZQUNsQjtBQUFBLFVBRUYsT0FBTztBQUNMLGtCQUFNLFVBQVU7QUFBQSxVQUNsQjtBQUFBLFFBQ0Y7QUFFQSxjQUFNLGVBQWUsU0FBU0gsU0FBUTtBQUVwQyxjQUFJLGNBQWNBLFFBQU8sZUFBZTtBQUV4QyxjQUFJLFlBQVk7QUFJaEIsbUJBQVMsTUFBTSxHQUFHLE1BQU0sYUFBYSxPQUFPLEdBQUc7QUFDN0MscUJBQVMsTUFBTSxHQUFHLE1BQU0sYUFBYSxPQUFPLEdBQUc7QUFFN0Msa0JBQUksWUFBWTtBQUNoQixrQkFBSSxPQUFPQSxRQUFPLE9BQU8sS0FBSyxHQUFHO0FBRWpDLHVCQUFTLElBQUksSUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBRS9CLG9CQUFJLE1BQU0sSUFBSSxLQUFLLGVBQWUsTUFBTSxHQUFHO0FBQ3pDO0FBQUEsZ0JBQ0Y7QUFFQSx5QkFBUyxJQUFJLElBQUksS0FBSyxHQUFHLEtBQUssR0FBRztBQUUvQixzQkFBSSxNQUFNLElBQUksS0FBSyxlQUFlLE1BQU0sR0FBRztBQUN6QztBQUFBLGtCQUNGO0FBRUEsc0JBQUksS0FBSyxLQUFLLEtBQUssR0FBRztBQUNwQjtBQUFBLGtCQUNGO0FBRUEsc0JBQUksUUFBUUEsUUFBTyxPQUFPLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBSTtBQUM1QyxpQ0FBYTtBQUFBLGtCQUNmO0FBQUEsZ0JBQ0Y7QUFBQSxjQUNGO0FBRUEsa0JBQUksWUFBWSxHQUFHO0FBQ2pCLDZCQUFjLElBQUksWUFBWTtBQUFBLGNBQ2hDO0FBQUEsWUFDRjtBQUFBLFVBQ0Y7QUFBQztBQUlELG1CQUFTLE1BQU0sR0FBRyxNQUFNLGNBQWMsR0FBRyxPQUFPLEdBQUc7QUFDakQscUJBQVMsTUFBTSxHQUFHLE1BQU0sY0FBYyxHQUFHLE9BQU8sR0FBRztBQUNqRCxrQkFBSSxRQUFRO0FBQ1osa0JBQUlBLFFBQU8sT0FBTyxLQUFLLEdBQUcsRUFBSSxVQUFTO0FBQ3ZDLGtCQUFJQSxRQUFPLE9BQU8sTUFBTSxHQUFHLEdBQUcsRUFBSSxVQUFTO0FBQzNDLGtCQUFJQSxRQUFPLE9BQU8sS0FBSyxNQUFNLENBQUMsRUFBSSxVQUFTO0FBQzNDLGtCQUFJQSxRQUFPLE9BQU8sTUFBTSxHQUFHLE1BQU0sQ0FBQyxFQUFJLFVBQVM7QUFDL0Msa0JBQUksU0FBUyxLQUFLLFNBQVMsR0FBRztBQUM1Qiw2QkFBYTtBQUFBLGNBQ2Y7QUFBQSxZQUNGO0FBQUEsVUFDRjtBQUlBLG1CQUFTLE1BQU0sR0FBRyxNQUFNLGFBQWEsT0FBTyxHQUFHO0FBQzdDLHFCQUFTLE1BQU0sR0FBRyxNQUFNLGNBQWMsR0FBRyxPQUFPLEdBQUc7QUFDakQsa0JBQUlBLFFBQU8sT0FBTyxLQUFLLEdBQUcsS0FDbkIsQ0FBQ0EsUUFBTyxPQUFPLEtBQUssTUFBTSxDQUFDLEtBQzFCQSxRQUFPLE9BQU8sS0FBSyxNQUFNLENBQUMsS0FDMUJBLFFBQU8sT0FBTyxLQUFLLE1BQU0sQ0FBQyxLQUMxQkEsUUFBTyxPQUFPLEtBQUssTUFBTSxDQUFDLEtBQzNCLENBQUNBLFFBQU8sT0FBTyxLQUFLLE1BQU0sQ0FBQyxLQUMxQkEsUUFBTyxPQUFPLEtBQUssTUFBTSxDQUFDLEdBQUk7QUFDcEMsNkJBQWE7QUFBQSxjQUNmO0FBQUEsWUFDRjtBQUFBLFVBQ0Y7QUFFQSxtQkFBUyxNQUFNLEdBQUcsTUFBTSxhQUFhLE9BQU8sR0FBRztBQUM3QyxxQkFBUyxNQUFNLEdBQUcsTUFBTSxjQUFjLEdBQUcsT0FBTyxHQUFHO0FBQ2pELGtCQUFJQSxRQUFPLE9BQU8sS0FBSyxHQUFHLEtBQ25CLENBQUNBLFFBQU8sT0FBTyxNQUFNLEdBQUcsR0FBRyxLQUMxQkEsUUFBTyxPQUFPLE1BQU0sR0FBRyxHQUFHLEtBQzFCQSxRQUFPLE9BQU8sTUFBTSxHQUFHLEdBQUcsS0FDMUJBLFFBQU8sT0FBTyxNQUFNLEdBQUcsR0FBRyxLQUMzQixDQUFDQSxRQUFPLE9BQU8sTUFBTSxHQUFHLEdBQUcsS0FDMUJBLFFBQU8sT0FBTyxNQUFNLEdBQUcsR0FBRyxHQUFJO0FBQ3BDLDZCQUFhO0FBQUEsY0FDZjtBQUFBLFlBQ0Y7QUFBQSxVQUNGO0FBSUEsY0FBSSxZQUFZO0FBRWhCLG1CQUFTLE1BQU0sR0FBRyxNQUFNLGFBQWEsT0FBTyxHQUFHO0FBQzdDLHFCQUFTLE1BQU0sR0FBRyxNQUFNLGFBQWEsT0FBTyxHQUFHO0FBQzdDLGtCQUFJQSxRQUFPLE9BQU8sS0FBSyxHQUFHLEdBQUk7QUFDNUIsNkJBQWE7QUFBQSxjQUNmO0FBQUEsWUFDRjtBQUFBLFVBQ0Y7QUFFQSxjQUFJLFFBQVEsS0FBSyxJQUFJLE1BQU0sWUFBWSxjQUFjLGNBQWMsRUFBRSxJQUFJO0FBQ3pFLHVCQUFhLFFBQVE7QUFFckIsaUJBQU87QUFBQSxRQUNUO0FBRUEsZUFBTztBQUFBLE1BQ1QsRUFBRTtBQU1GLFVBQUksU0FBUyxXQUFXO0FBRXRCLFlBQUksWUFBWSxJQUFJLE1BQU0sR0FBRztBQUM3QixZQUFJLFlBQVksSUFBSSxNQUFNLEdBQUc7QUFHN0IsaUJBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLLEdBQUc7QUFDN0Isb0JBQVUsQ0FBQyxJQUFJLEtBQUs7QUFBQSxRQUN0QjtBQUNBLGlCQUFTLElBQUksR0FBRyxJQUFJLEtBQUssS0FBSyxHQUFHO0FBQy9CLG9CQUFVLENBQUMsSUFBSSxVQUFVLElBQUksQ0FBQyxJQUMxQixVQUFVLElBQUksQ0FBQyxJQUNmLFVBQVUsSUFBSSxDQUFDLElBQ2YsVUFBVSxJQUFJLENBQUM7QUFBQSxRQUNyQjtBQUNBLGlCQUFTLElBQUksR0FBRyxJQUFJLEtBQUssS0FBSyxHQUFHO0FBQy9CLG9CQUFVLFVBQVUsQ0FBQyxDQUFFLElBQUk7QUFBQSxRQUM3QjtBQUVBLFlBQUksUUFBUSxDQUFDO0FBRWIsY0FBTSxPQUFPLFNBQVMsR0FBRztBQUV2QixjQUFJLElBQUksR0FBRztBQUNULGtCQUFNLFVBQVUsSUFBSTtBQUFBLFVBQ3RCO0FBRUEsaUJBQU8sVUFBVSxDQUFDO0FBQUEsUUFDcEI7QUFFQSxjQUFNLE9BQU8sU0FBUyxHQUFHO0FBRXZCLGlCQUFPLElBQUksR0FBRztBQUNaLGlCQUFLO0FBQUEsVUFDUDtBQUVBLGlCQUFPLEtBQUssS0FBSztBQUNmLGlCQUFLO0FBQUEsVUFDUDtBQUVBLGlCQUFPLFVBQVUsQ0FBQztBQUFBLFFBQ3BCO0FBRUEsZUFBTztBQUFBLE1BQ1QsRUFBRTtBQU1GLGVBQVMsYUFBYSxLQUFLLE9BQU87QUFFaEMsWUFBSSxPQUFPLElBQUksVUFBVSxhQUFhO0FBQ3BDLGdCQUFNLElBQUksU0FBUyxNQUFNO0FBQUEsUUFDM0I7QUFFQSxZQUFJLE9BQU8sV0FBVztBQUNwQixjQUFJLFNBQVM7QUFDYixpQkFBTyxTQUFTLElBQUksVUFBVSxJQUFJLE1BQU0sS0FBSyxHQUFHO0FBQzlDLHNCQUFVO0FBQUEsVUFDWjtBQUNBLGNBQUlJLFFBQU8sSUFBSSxNQUFNLElBQUksU0FBUyxTQUFTLEtBQUs7QUFDaEQsbUJBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxTQUFTLFFBQVEsS0FBSyxHQUFHO0FBQy9DLFlBQUFBLE1BQUssQ0FBQyxJQUFJLElBQUksSUFBSSxNQUFNO0FBQUEsVUFDMUI7QUFDQSxpQkFBT0E7QUFBQSxRQUNULEVBQUU7QUFFRixZQUFJLFFBQVEsQ0FBQztBQUViLGNBQU0sUUFBUSxTQUFTLE9BQU87QUFDNUIsaUJBQU8sS0FBSyxLQUFLO0FBQUEsUUFDbkI7QUFFQSxjQUFNLFlBQVksV0FBVztBQUMzQixpQkFBTyxLQUFLO0FBQUEsUUFDZDtBQUVBLGNBQU0sV0FBVyxTQUFTLEdBQUc7QUFFM0IsY0FBSUMsT0FBTSxJQUFJLE1BQU0sTUFBTSxVQUFVLElBQUksRUFBRSxVQUFVLElBQUksQ0FBQztBQUV6RCxtQkFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFVBQVUsR0FBRyxLQUFLLEdBQUc7QUFDN0MscUJBQVMsSUFBSSxHQUFHLElBQUksRUFBRSxVQUFVLEdBQUcsS0FBSyxHQUFHO0FBQ3pDLGNBQUFBLEtBQUksSUFBSSxDQUFDLEtBQUssT0FBTyxLQUFLLE9BQU8sS0FBSyxNQUFNLE1BQU0sQ0FBQyxDQUFFLElBQUksT0FBTyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUUsQ0FBRTtBQUFBLFlBQ3BGO0FBQUEsVUFDRjtBQUVBLGlCQUFPLGFBQWFBLE1BQUssQ0FBQztBQUFBLFFBQzVCO0FBRUEsY0FBTSxNQUFNLFNBQVMsR0FBRztBQUV0QixjQUFJLE1BQU0sVUFBVSxJQUFJLEVBQUUsVUFBVSxJQUFJLEdBQUc7QUFDekMsbUJBQU87QUFBQSxVQUNUO0FBRUEsY0FBSSxRQUFRLE9BQU8sS0FBSyxNQUFNLE1BQU0sQ0FBQyxDQUFFLElBQUksT0FBTyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUU7QUFFbEUsY0FBSUEsT0FBTSxJQUFJLE1BQU0sTUFBTSxVQUFVLENBQUU7QUFDdEMsbUJBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxVQUFVLEdBQUcsS0FBSyxHQUFHO0FBQzdDLFlBQUFBLEtBQUksQ0FBQyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQUEsVUFDeEI7QUFFQSxtQkFBUyxJQUFJLEdBQUcsSUFBSSxFQUFFLFVBQVUsR0FBRyxLQUFLLEdBQUc7QUFDekMsWUFBQUEsS0FBSSxDQUFDLEtBQUssT0FBTyxLQUFLLE9BQU8sS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFFLElBQUksS0FBSztBQUFBLFVBQ3hEO0FBR0EsaUJBQU8sYUFBYUEsTUFBSyxDQUFDLEVBQUUsSUFBSSxDQUFDO0FBQUEsUUFDbkM7QUFFQSxlQUFPO0FBQUEsTUFDVDtBQUFDO0FBTUQsVUFBSSxZQUFZLFdBQVc7QUFFekIsWUFBSSxpQkFBaUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsVUFRbkIsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksQ0FBQztBQUFBO0FBQUEsVUFHVCxDQUFDLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDVixDQUFDLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDVixDQUFDLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDVixDQUFDLEdBQUcsSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUdWLENBQUMsR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNWLENBQUMsR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNWLENBQUMsR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNWLENBQUMsR0FBRyxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR1YsQ0FBQyxHQUFHLEtBQUssRUFBRTtBQUFBLFVBQ1gsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksQ0FBQztBQUFBO0FBQUEsVUFHVCxDQUFDLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDWixDQUFDLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDVixDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDckIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBO0FBQUEsVUFHckIsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ1YsQ0FBQyxHQUFHLElBQUksRUFBRTtBQUFBO0FBQUEsVUFHVixDQUFDLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDVixDQUFDLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDVixDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDckIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBO0FBQUEsVUFHckIsQ0FBQyxHQUFHLEtBQUssRUFBRTtBQUFBLFVBQ1gsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3JCLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNyQixDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUdyQixDQUFDLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDWixDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDckIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3JCLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3JCLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNyQixDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDckIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3JCLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3JCLENBQUMsR0FBRyxLQUFLLEVBQUU7QUFBQSxVQUNYLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNyQixDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDckIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBO0FBQUEsVUFHckIsQ0FBQyxHQUFHLEtBQUssSUFBSSxHQUFHLEtBQUssRUFBRTtBQUFBLFVBQ3ZCLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNyQixDQUFDLEdBQUcsSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDckIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBO0FBQUEsVUFHckIsQ0FBQyxHQUFHLEtBQUssR0FBRztBQUFBLFVBQ1osQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3JCLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNyQixDQUFDLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3JCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxJQUFJLEdBQUcsS0FBSyxFQUFFO0FBQUEsVUFDdkIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3JCLENBQUMsR0FBRyxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUNyQixDQUFDLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxJQUFJLEdBQUcsS0FBSyxFQUFFO0FBQUEsVUFDdkIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3JCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3JCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd2QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ1gsQ0FBQyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3RCLENBQUMsR0FBRyxLQUFLLEtBQUssR0FBRyxLQUFLLEdBQUc7QUFBQSxVQUN6QixDQUFDLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDWCxDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDdEIsQ0FBQyxJQUFJLElBQUksRUFBRTtBQUFBO0FBQUEsVUFHWCxDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUN2QixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd2QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUN2QixDQUFDLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd2QixDQUFDLElBQUksS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDMUIsQ0FBQyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd0QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd2QixDQUFDLEdBQUcsS0FBSyxLQUFLLElBQUksS0FBSyxHQUFHO0FBQUEsVUFDMUIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd2QixDQUFDLEdBQUcsS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDekIsQ0FBQyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd2QixDQUFDLEdBQUcsS0FBSyxLQUFLLElBQUksS0FBSyxHQUFHO0FBQUEsVUFDMUIsQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3ZCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQSxVQUN2QixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd2QixDQUFDLElBQUksS0FBSyxLQUFLLEdBQUcsS0FBSyxHQUFHO0FBQUEsVUFDMUIsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQSxVQUN0QixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUE7QUFBQSxVQUd2QixDQUFDLElBQUksS0FBSyxHQUFHO0FBQUEsVUFDYixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDdkIsQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3ZCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3ZCLENBQUMsSUFBSSxLQUFLLEtBQUssR0FBRyxLQUFLLEdBQUc7QUFBQSxVQUMxQixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDdkIsQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3ZCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3ZCLENBQUMsSUFBSSxLQUFLLEtBQUssR0FBRyxLQUFLLEdBQUc7QUFBQSxVQUMxQixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDdkIsQ0FBQyxJQUFJLElBQUksSUFBSSxHQUFHLElBQUksRUFBRTtBQUFBLFVBQ3RCLENBQUMsSUFBSSxJQUFJLElBQUksR0FBRyxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3RCLENBQUMsSUFBSSxLQUFLLEtBQUssR0FBRyxLQUFLLEdBQUc7QUFBQSxVQUMxQixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDdkIsQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3ZCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3ZCLENBQUMsR0FBRyxLQUFLLEtBQUssSUFBSSxLQUFLLEdBQUc7QUFBQSxVQUMxQixDQUFDLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDdEIsQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3ZCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3RCLENBQUMsSUFBSSxLQUFLLEtBQUssR0FBRyxLQUFLLEdBQUc7QUFBQSxVQUMxQixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDdkIsQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3ZCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3ZCLENBQUMsR0FBRyxLQUFLLEtBQUssSUFBSSxLQUFLLEdBQUc7QUFBQSxVQUMxQixDQUFDLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQUEsVUFDdkIsQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3ZCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3ZCLENBQUMsSUFBSSxLQUFLLEtBQUssR0FBRyxLQUFLLEdBQUc7QUFBQSxVQUMxQixDQUFDLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFO0FBQUEsVUFDdEIsQ0FBQyxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtBQUFBLFVBQ3ZCLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFBQTtBQUFBLFVBR3ZCLENBQUMsSUFBSSxLQUFLLEtBQUss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RTtBQUFBLE9BQ0Y7QUFBQSxLQUNGO0FBRUo7QUFFQSxTQUFTLFlBQVksV0FBNEI7QUFDL0MsTUFBSSxDQUFDLFVBQVcsUUFBTztBQUN2QixRQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsS0FBSyxPQUFPLFlBQVksS0FBSyxJQUFJLEtBQUssR0FBSSxDQUFDO0FBQ3BFLFFBQU0sSUFBSSxLQUFLLE1BQU0sT0FBTyxFQUFFO0FBQzlCLFFBQU0sSUFBSSxPQUFPO0FBQ2pCLFNBQU8sR0FBRyxPQUFPLENBQUMsRUFBRSxTQUFTLEdBQUcsR0FBRyxDQUFDLElBQUksT0FBTyxDQUFDLEVBQUUsU0FBUyxHQUFHLEdBQUcsQ0FBQztBQUNwRTtBQUlBLElBQU0sTUFBTTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTsiLAogICJuYW1lcyI6IFsibW9kdWxlIiwgInFyY29kZSIsICJ0eXBlTnVtYmVyIiwgImVycm9yQ29ycmVjdGlvbkxldmVsIiwgInVuaWNvZGVNYXAiLCAiX251bSIsICJudW0iLCAiX3RoaXMiLCAiZGF0YSIsICJxcmNvZGUiXQp9Cg==
