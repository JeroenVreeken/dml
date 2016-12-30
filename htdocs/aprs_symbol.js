/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2016

	@licstart  The following is the entire license notice for the 
	JavaScript code in this page.

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.

	@licend  The above is the entire license notice
	for the JavaScript code in this page.
 */

/* Accepts a two letter symbol code and returns a dataurl */
function aprs_symbol(symbolcode) {
	pos = aprs_symbol.code2pos[symbolcode[1]];
	
	if (symbolcode[0] == "/") {
		img = aprs_symbol.table_pri;
		overlay = false;
	} else {
		if (symbolcode[0] == "\\") {
			overlay = false;
		} else {
			overlay = true;
		}
		img = aprs_symbol.table_alt;
	}
	
	var canvas = document.createElement("canvas");
	w = img.width / 16;
	h = img.height / 6;
	if (h == 0 || w == 0) {
		return undefined;
	}
	canvas.width = w;
	canvas.height = h;
	
	var ctx = canvas.getContext('2d');
	
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	
	ctx.drawImage(img, -pos[1] * w, -pos[0] * h);

	if (overlay) {
		img = aprs_symbol.table_ol;
		if (img.height && img.width) {
			pos = aprs_symbol.code2pos[symbolcode[0]];
			ctx.drawImage(img, -pos[1] * aprs_symbol.width, -pos[0] * aprs_symbol.height);
		}
	}
	
	return canvas.toDataURL();
}

aprs_symbol.code2pos = {
	"!": [ 0, 0 ],
	"\"": [ 0, 1 ],
	"#": [ 0, 2 ],
	"$": [ 0, 3 ],
	"%": [ 0, 4 ],
	"&": [ 0, 5 ],
	"'": [ 0, 6 ],
	"(": [ 0, 7 ],
	")": [ 0, 8 ],
	"*": [ 0, 9 ],
	"+": [ 0, 10 ],
	",": [ 0, 11 ],
	"-": [ 0, 12 ],
	".": [ 0, 13 ],
	"/": [ 0, 14 ],
	"0": [ 0, 15 ],
	"1": [ 1, 0 ],
	"2": [ 1, 1 ],
	"3": [ 1, 2 ],
	"4": [ 1, 3 ],
	"5": [ 1, 4 ],
	"6": [ 1, 5 ],
	"7": [ 1, 6 ],
	"8": [ 1, 7 ],
	"9": [ 1, 8 ],
	":": [ 1, 9 ],
	";": [ 1, 10 ],
	"<": [ 1, 11 ],
	"=": [ 1, 12 ],
	">": [ 1, 13 ],
	"?": [ 1, 14 ],
	"@": [ 1, 15 ],
	"A": [ 2, 0 ],
	"B": [ 2, 1 ],
	"C": [ 2, 2 ],
	"D": [ 2, 3 ],
	"E": [ 2, 4 ],
	"F": [ 2, 5 ],
	"G": [ 2, 6 ],
	"H": [ 2, 7 ],
	"I": [ 2, 8 ],
	"J": [ 2, 9 ],
	"K": [ 2, 10 ],
	"L": [ 2, 11 ],
	"M": [ 2, 12 ],
	"N": [ 2, 13 ],
	"O": [ 2, 14 ],
	"P": [ 2, 15 ],
	"Q": [ 3, 0 ],
	"R": [ 3, 1 ],
	"S": [ 3, 2 ],
	"T": [ 3, 3 ],
	"U": [ 3, 4 ],
	"V": [ 3, 5 ],
	"W": [ 3, 6 ],
	"X": [ 3, 7 ],
	"Y": [ 3, 8 ],
	"Z": [ 3, 9 ],
	"[": [ 3, 10 ],
	"\\": [ 3, 11 ],
	"]": [ 3, 12 ],
	"^": [ 3, 13 ],
	"_": [ 3, 14 ],
	"`": [ 3, 15 ],
	"a": [ 4, 0 ],
	"b": [ 4, 1 ],
	"c": [ 4, 2 ],
	"d": [ 4, 3 ],
	"e": [ 4, 4 ],
	"f": [ 4, 5 ],
	"g": [ 4, 6 ],
	"h": [ 4, 7 ],
	"i": [ 4, 8 ],
	"j": [ 4, 9 ],
	"k": [ 4, 10 ],
	"l": [ 4, 11 ],
	"m": [ 4, 12 ],
	"n": [ 4, 13 ],
	"o": [ 4, 14 ],
	"p": [ 4, 15 ],
	"q": [ 5, 0 ],
	"r": [ 5, 1 ],
	"s": [ 5, 2 ],
	"t": [ 5, 3 ],
	"u": [ 5, 4 ],
	"v": [ 5, 5 ],
	"w": [ 5, 6 ],
	"x": [ 5, 7 ],
	"y": [ 5, 8 ],
	"z": [ 5, 9 ],
	"{": [ 5, 10 ],
	"|": [ 5, 11 ],
	"}": [ 5, 12 ],
	"~": [ 5, 13 ],
};

aprs_symbol.table_pri = new Image();
aprs_symbol.table_alt = new Image();
aprs_symbol.table_ol = new Image();
aprs_symbol.table_pri.src = "aprs-symbols-24-0.png";
aprs_symbol.table_alt.src = "aprs-symbols-24-1.png";
aprs_symbol.table_ol.src = "aprs-symbols-24-2.png";
aprs_symbol.width = 24;
aprs_symbol.height = 24;
