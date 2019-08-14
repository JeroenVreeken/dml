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


var DML = {
	PACKET:  {
		HELLO: 0,
		ROUTE: 1,
		DESCRIPTION: 2,
		CERTIFICATE: 3,
		HEADER: 4,
		CONNECT: 5,
		DISC: 6,

		REQ_DESCRIPTION: 34,
		REQ_CERTIFICATE: 35,
		REQ_HEADER: 36,
		REQ_REVERSE: 37,
		REQ_DISC: 38,
		
		DATA: 4096,
	},
	ID: {
		SIZE: 32,
	},
	SIG: {
		SIZE: ((256 * 2) / 8),
	},
	TIMESTAMP: {
		SIZE: 8,
	},
	HELLO_FLAG: {
		LEAF: 1,
		UPDATES: 2,
	}
};

function dml()
{
	url = "ws://" + location.host;
	var dml_this = this;

	
	var open_cb = function() {}
	var packet_hello_cb = function(flags, ident) {}
	var packet_route_cb = function(hops, id) {}
	var packet_description_cb = function(id, version, bps, mime, name, alias, description) {}
	var packet_header_cb = function(header_id, header_data, header_sig) {}
	var packet_data_cb = function(data, timestamp, signature) {}
	var packet_certificate_cb = function(certificate_id, certificate_payload) {}

	dml_this.ws = new WebSocket(url);

	dml_this.func_onmessage = function(msg) {
//		console.log("dml_this.ws.onmessage: " + msg.data.byteLength);
	
		header = new DataView(msg.data, 0, 4);
		id = header.getUint16(0, false);
		len = header.getUint16(2, false);
		data = new DataView(msg.data, 4);
		pos = 4;
	
//		console.log("len: " + len + " id: " + id);

		switch(id) {
			case DML.PACKET.HELLO: {
				flags = data.getUint32(0, false);
				pos += 4;
				data = new DataView(msg.data, pos);

				ident = data2str(data);
				dml_this.packet_hello_cb(flags, ident);
				break;
			}
			case DML.PACKET.ROUTE: {
				hops = data.getUint8(32);
				route_id = msg.data.slice(pos, pos + DML.ID.SIZE);
				
				dml_this.packet_route_cb(hops, route_id);
				break;
			}
			case DML.PACKET.DESCRIPTION: {
				desc_id = msg.data.slice(pos, pos + DML.ID.SIZE);
				pos += DML.ID.SIZE;
				data = new DataView(msg.data, pos);
				desc_version = data.getUint8(0);
				desc_bps = data.getUint32(1, false);
				pos += 5;
				data = new DataView(msg.data, pos);
				desc_mime = data2str(data);
				pos += desc_mime.length + 1;
				data = new DataView(msg.data, pos);
				desc_name = data2str(data);
				pos += desc_name.length + 1;
				data = new DataView(msg.data, pos);
				desc_alias = data2str(data);
				pos += desc_alias.length + 1;
				data = new DataView(msg.data, pos);
				desc_description = data2str(data);
				pos += desc_description.length + 1;
				
				dml_this.packet_description_cb(
				    desc_id, desc_version, desc_bps, desc_mime, 
				    desc_name, desc_alias, desc_description);
				break;
			}
			case DML.PACKET.HEADER: {
				header_id = msg.data.slice(pos, pos + DML.ID.SIZE);
				header_data = msg.data.slice(pos + DML.ID.SIZE, pos + len - DML.SIG.SIZE);
				header_sig = msg.data.slice(pos + len - DML.SIG.SIZE, pos + len);
				
				dml_this.packet_header_cb(
				    header_id, header_data, header_sig);
				break;
			}
			case DML.PACKET.CERTIFICATE: {
				certificate_id = msg.data.slice(pos, pos + DML.ID.SIZE);
				certificate_payload = msg.data.slice(pos + DML.ID.SIZE, pos + len);
				
				dml_this.packet_certificate_cb(
				    certificate_id, certificate_payload);
				break;
			}
			default: {
				if (id == connected_data_id) {
					data = msg.data.slice(pos, pos + len - DML.SIG.SIZE - DML.TIMESTAMP.SIZE);
					signature = msg.data.slice(pos + len - DML.SIG.SIZE, pos + len);
					timestampdata = new DataView(msg.data, pos + len - DML.SIG.SIZE - DML.TIMESTAMP.SIZE);
					timestamp = timestampdata.getUint32(0, false) << 32;
					timestamp += timestampdata.getUint32(4, false);
					
					dml_this.packet_data_cb(data, timestamp, signature);
				}
			}
		}
	}

	dml_this.func_onopen = function(event) {
		console.log("dml_this.ws.onopen()");
		dml_this.ws.binaryType = "arraybuffer";
		dml_this.open_cb();
	}

	dml_this.func_onclose = function(event) {
		console.log("dml_this.ws.onclose(): " + event.code + ", " + event.reason);
		setTimeout(function(){
			dml_this.ws = null;
			dml_this.ws = new WebSocket(url);
			dml_this.set_ws_handlers();
		}, 3000);
	}

	dml_this.func_onerror = function(event) {
		console.log("dml_this.ws.onerror(): " + event.data);
	}
	
	dml_this.set_ws_handlers = function() {
		dml_this.ws.onmessage = dml_this.func_onmessage;
		dml_this.ws.onopen = dml_this.func_onopen;
		dml_this.ws.onclose = dml_this.func_onclose;
		dml_this.ws.onerror = dml_this.func_onerror;
	}
	dml_this.set_ws_handlers();
	
	this.send = function dml_connection_send(id, payload_arraybuffer) {
		data = new ArrayBuffer(payload_arraybuffer.byteLength + 4);
		dataview = new DataView(data);
		dataview.setUint16(0, id, false);
		dataview.setUint16(2, payload_arraybuffer.byteLength, false);
		
		payloadview = new DataView(payload_arraybuffer);
		
		var i;
		for (i = 0; i < payload_arraybuffer.byteLength; i++) {
			dataview.setUint8(4 + i, payloadview.getUint8(i));
		}
		dml_this.ws.send(data);
	}
	
	this.send_req_description = function dml_packet_send_req_description(id) {
		dml_this.send(DML.PACKET.REQ_DESCRIPTION, id);
	}
	this.send_req_header = function dml_packet_send_req_header(id) {
		dml_this.send(DML.PACKET.REQ_HEADER, id);
	}
	this.send_req_disc = function dml_packet_send_req_disc(id) {
		dml_this.send(DML.PACKET.REQ_DISC, id);
	}
	this.send_req_certificate = function dml_packet_send_req_certificate(id) {
		dml_this.send(DML.PACKET.REQ_CERTIFICATE, id);
	}
	this.send_connect = function dml_packet_send_connect(id, packet_id) {
		data = new ArrayBuffer(id.byteLength + 2);
		ab_copy(data, 0, id, 0, DML.ID.SIZE);
		dataview = new DataView(data);
		dataview.setUint16(id.byteLength, packet_id, false);
		dml_this.send(DML.PACKET.CONNECT, data);
	}

	this.hello_flag2str = function dml_hello_flag2str(flag) {
		var str = "";
		if (flag & DML.HELLO_FLAG.LEAF) {
			if (str.length)
				str += ", ";
			str += "LEAF";
		}
		if (flag & DML.HELLO_FLAG.UPDATES) {
			if (str.length)
				str += ", ";
			str += "UPDATES";
		}
		return str;
	}
}

