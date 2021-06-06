/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2021

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

#include <dml/dml_host.h>
#include "dml_config.h"

#include <stdio.h>

static struct dml_host *host;
static struct dml_stream *stream;


int main(int argc, char **argv)
{
	char *file = "dml_group.conf";
	char *certificate;
	char *key;
	char *name;
	char *description;
	char *alias;
	uint32_t bps = 100;
	struct dml_crypto_key *dk;
	static uint8_t id[DML_ID_SIZE];

	if (argc > 1)
		file = argv[1];

	host = dml_host_create(file);
	if (!host) {
		printf("Could not create host\n");
		return -1;
	}
	name = dml_config_value("name", NULL, "test_group");
	alias = dml_config_value("alias", NULL, "");
	description = dml_config_value("description", NULL, "Test group");

	certificate = dml_config_value("certificate", NULL, "");
	key = dml_config_value("key", NULL, "");

	if (dml_crypto_load_cert(certificate)) {
		printf("Could not load certificate\n");
		return -1;
	}
	
	if (!(dk = dml_crypto_private_load(key))) {
		printf("Could not load key\n");
		return -1;
	}
	
	if (dml_id_gen(id, DML_PACKET_DESCRIPTION_VERSION_0, bps, 
	    DML_MIME_FPRS, name, alias, description))
		return -1;
    	
	stream = dml_stream_by_id_alloc(id);
	dml_stream_mine_set(stream, true);
	dml_stream_crypto_set(stream, dk);
    	dml_stream_name_set(stream, name);
	dml_stream_alias_set(stream, alias);
	dml_stream_mime_set(stream, DML_MIME_FPRS);
	dml_stream_description_set(stream, description);
	dml_stream_bps_set(stream, bps);
	
	dml_host_mime_filter_set(host, 1, (char*[]){ DML_MIME_FPRS });
//	dml_host_stream_data_cb_set(host, stream_data_cb, NULL);
//	dml_host_stream_req_reverse_connect_cb_set(host, stream_req_reverse_connect_cb, NULL);
//	dml_host_stream_req_reverse_disconnect_cb_set(host, stream_req_reverse_disconnect_cb, NULL);


//	g_timeout_add_seconds(DML_REFLECTOR_DATA_KEEPALIVE, watchdog, &watchdog);

	g_main_loop_run(g_main_loop_new(NULL, false));

	return 0;
}
