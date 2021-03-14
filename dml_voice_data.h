/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2020

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

#ifndef _INCLUDE_DML_VOICE_DATA_H_
#define _INCLUDE_DML_VOICE_DATA_H_

#include <eth_ar/eth_ar.h>

int dml_voice_data_level_check(void *data, size_t data_size);
void dml_voice_data_exclude(uint8_t ex_call[ETH_AR_MAC_SIZE], uint8_t level);

#endif // _INCLUDE_DML_VOICE_DATA_H_

