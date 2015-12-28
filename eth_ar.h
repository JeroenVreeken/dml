/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015

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
#ifndef _INCLUDE_ETH_AR_H_
#define _INCLUDE_ETH_AR_H_

#include <stdint.h>

#define ETH_P_CODEC2	0x7300

#define ETH_AR_CALL_LEN_MAX	8
#define ETH_AR_CALL_SIZE	9

int eth_ar_call2mac(uint8_t mac[6], char *callsign, int ssid);
int eth_ar_mac2call(char *callsign, int *ssid, uint8_t mac[6]);


#endif /* _INCLUDE_ETH_AR_H_ */