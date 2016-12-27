/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2016

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

 */

var FPRS = {
	ELEMENT: {
		/* length limited ,to 7 */
		ERROR: -1,
		POSITION: 0,
		CALLSIGN: 1,
		SYMBOL: 2,
		ALTITUDE: 3,
		VECTOR: 4,
		/* length limited to 255 */
		OBJECTNAME: 16,
		COMMENT: 17,
		REQUEST: 18,
		DESTINATION: 19,
		TIMESTAMP: 20,
		DMLSTREAM: 21,
		DMLASSOC: 22,
	}
};


function fprs_element(eltype, elsize, eldataview, eloff)
{
	var type_el = eltype;
	var size = elsize;
	var dataview = new DataView(eldataview.buffer, eldataview.byteOffset + eloff, elsize);
	
	this.type_get = function() {
		return type_el;
	}
	
	this.position_dec = function() {
		if (type_el != FPRS.ELEMENT.POSITION)
			return undefined;
		
		var fixed = dataview.getUint8(3) & 0x08;
		var longitude = 0;
		var latitude = 0;

		longitude  = dataview.getUint8(0) << 20;
		longitude |= dataview.getUint8(1) << 12;
		longitude |= dataview.getUint8(2) << 4;
		longitude |= (dataview.getUint8(3) & 0xf0) >> 4;
		if (longitude & 0x08000000) {
			longitude ^= 0x0fffffff;
			longitude += 1;
			longitude = - longitude;
		}
		longitude = (longitude * 180.0) / 134217728;
		if (longitude > 180)
			longitude -= 360;

		latitude  = (dataview.getUint8(3) & 0x07) << 24;
		latitude |= dataview.getUint8(4) << 16;
		latitude |= dataview.getUint8(5) << 8;
		latitude |= dataview.getUint8(6);

		if (latitude & 0x04000000) {
			latitude ^= 0x07ffffff;
			latitude += 1;
			latitude = - latitude;
		}
		latitude = (latitude * 90.0) / 67108864;
				
		return { 
		    longitude: longitude, 
		    latitude: latitude,
		    fixed: fixed,
		};
	}

	this.tostring = function fprs_element_tostring() {
		var str = "";

		switch (type_el) {
			case FPRS.ELEMENT.POSITION:
				str+= "POSITION: ";
	
				var dec = this.position_dec();
				
				str += dec.longitude + " " + dec.latitude;
				if (dec.fixed)
					str += " Fixed";
				
				break;
			case FPRS.ELEMENT.CALLSIGN:
				str+= "CALLSIGN: ";
				str+= eth_ar.call(dataview.buffer, dataview.byteOffset);
				break;
			case FPRS.ELEMENT.SYMBOL:
				str+= "SYMBOL: ";
				var c0 = dataview.getUint8(0, false);
				var c1 = dataview.getUint8(1, false);
				str += String.fromCharCode(c0);
				str += String.fromCharCode(c1);
				break;
			case FPRS.ELEMENT.ALTITUDE:
				str+= "ALTITUDE";
				break;
			case FPRS.ELEMENT.VECTOR:
				str+= "VECTOR";
				break;
			case FPRS.ELEMENT.OBJECTNAME:
				str+= "OBJECTNAME";
				break;
			case FPRS.ELEMENT.COMMENT:
				str+= "COMMENT: ";
				str+= data2str(dataview);
				break;
			case FPRS.ELEMENT.REQUEST:
				str+= "REQUEST: ";
				var i;
				str+= eth_ar.call(dataview.buffer, dataview.byteOffset);
				str+= ":"
				for (i = 6; i < dataview.byteLength; i+=2) {
					var rt = dataview.getUint16(i, false);
					str+= " " + rt;
				}
				break;
			case FPRS.ELEMENT.DESTINATION:
				str+= "DESTINATION";
				break;
			case FPRS.ELEMENT.TIMESTAMP:
				str+= "TIMESTAMP: ";
				var t = 0;
				var i;
				for (i = 0; i < dataview.byteLength; i++) {
					t *= 256;
					t += dataview.getUint8(i, false);
				}
				var timestamp_date = new Date(t*1000);
				str += timestamp_date.toISOString();
				
				break;
			case FPRS.ELEMENT.DMLSTREAM:
				str+= "DMLSTREAM: ";
				str+= data2str(dataview);
				break;
			case FPRS.ELEMENT.DMLASSOC:
				str+= "DMLASSOC: ";
				str+= data2str(dataview);
				break;
		}
		
		return str;
	}
}

function fprs_frame(fprs_arraybuffer)
{
	var dv = new DataView(fprs_arraybuffer);
	
	this.elements = new Array();
	var i;
	
	for (i = 0; i < dv.byteLength;) {
		var left = dv.byteLength - i;
		var el0 = dv.getUint8(i+0);
		var el_size_total = 1;
		var el_size = 0;
		var el_start = i;
		var el_type = FPRS.ELEMENT.ERROR;
		var el_off;
		
		if ((el0 & 0x80) == 0) {
			el_size = el0 & 0x07;
			el_size_total = el_size + 1;
			el_type = (el0 & 0x78) >> 3;
			el_off = i + 1;
		} else if (left >= 2) {
			var el1 = dv.getUint8(i+1);
			
			if ((el0 & 0xc0) == 0x80) {
				el_size = el1;
				el_size_total = el_size + 2;
				el_type = el0 & 0x3f;
				el_off = i + 2;
			} else if (left >= 3) {
				var el2 = dv.getUint8(i+2);
				
				el_size = el2;
				el_size_total = el_size + 3;
				el_type = el1 + ((el0 & 0x1f) << 8);
				el_off = i + 3;
			}
		}
		
		if (el_size_total && el_size_total <= left) {
			/* Got an element */
			
			this.elements.push(new fprs_element(el_type, el_size, dv, el_off));
		}
		
		i += el_size_total;
	}
}

