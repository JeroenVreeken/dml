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

function eth_ar()
{
	var eth_ar_this = this;
	
	this.alnum2code = [
		'0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
		'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
		'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 
		''
	];

	
	this.call = function (mac, offset) {
		var offset = typeof offset !== 'undefined' ? offset : 0;
		var dv = new DataView(mac, offset);
		
		var multicast = dv.getUint8(0) & 0x01;
		var ssid = (dv.getUint8(0) & 0x3c) >> 2;
		var macc = (dv.getUint8(0) & 0xc0) >> 6;

		/* Do not use binary operators here!
		   They are limited to 32bit in this poor excuse for a language... */
		macc *= 256;
		macc += dv.getUint8(1);
		macc *= 256;
		macc += dv.getUint8(2);
		macc *= 256;
		macc += dv.getUint8(3);
		macc *= 256;
		macc += dv.getUint8(4);
		macc *= 256;
		macc += dv.getUint8(5);
		
		var i;
		var callsign = "";
		for (i = 0; i < 8; i++) {
			var c = (macc % 37)  & 0x3f;
			callsign += eth_ar_this.alnum2code[c];
			macc /= 37;
		}
		callsign += "-" + ssid;
		
		if (multicast) {
			callsign = "MULTICAST";
		}
		
		return callsign;
	}
}
