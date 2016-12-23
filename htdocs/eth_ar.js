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
