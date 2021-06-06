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
#include <dml/dml.h>
#include <eth_ar/eth_ar.h>

#include <stdio.h>
#include <string.h>

#define DML_GUARD_TIME_MS (200)

static uint8_t tx_level = 0;

static uint8_t tx_call[ETH_AR_MAC_SIZE] = {0};
static uint8_t ex_call[ETH_AR_MAC_SIZE] = {0};
static uint8_t ex_level = 0;

static gboolean guard_cb(void *arg)
{
	printf("No incomming activity, releasing guard\n");

	tx_level = 0;

	return G_SOURCE_REMOVE;
}


int dml_voice_data_level_check(void *data, size_t data_size)
{
	struct dml_dv_c2_header *header = data;
	uint8_t level = header->level;

	if (!memcmp(data, ex_call, ETH_AR_MAC_SIZE) && level == ex_level) {
		printf("Dropped due to rx loop guard\n");
		return -1;
	}
		
	if (level > tx_level) {
		char call[ETH_AR_CALL_SIZE];
		int ssid;
		bool multicast;
		
		eth_ar_mac2call(call, &ssid, &multicast, header->from);
		tx_level = level;
		memcpy(tx_call, header->from, ETH_AR_MAC_SIZE);
		printf("State changed to %s (level=%d) by %s-%d\n", level ? "ON":"OFF", level, multicast ? "MULTICAST" : call, ssid);
	} else {
		/* once we accept one connection, don't allow it to be hijacked by someone else */
		if (memcmp(header->from, tx_call, ETH_AR_MAC_SIZE)) {
			printf("Dropped due to tx guard\n");
			return -1;
		}
		tx_level = level;
		printf("Accepted\n");
		g_source_remove_by_user_data(&tx_level);
		g_timeout_add(DML_GUARD_TIME_MS, guard_cb, &tx_level);
	}

	return 0;
}

void dml_voice_data_exclude(char call[ETH_AR_MAC_SIZE], uint8_t level)
{
	memcpy(ex_call, call, ETH_AR_MAC_SIZE);
	ex_level = level;
}
