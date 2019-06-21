/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015, 2016

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
#include <dml/dml_poll.h>
#include <dml/dml.h>
#include <dml/dml_id.h>
#include <dml/dml_crypto.h>
#include "dml_config.h"
#include "dml_stream_client_simple.h"

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>


size_t skip = 0;

static int data_cb(void *arg, void *data, size_t datasize)
{
	if (datasize <= skip) {
		return 0;
	}
	size_t writesize = datasize - skip;
	
	if (write(1, data + skip, writesize) != writesize)
		return -1;
	
	return 0;
}

int main(int argc, char **argv)
{
	char *file = "dml_stream_client.conf";
	char *ca;
	char *server;
	char *req_id_str;
	uint8_t req_id[DML_ID_SIZE];
	struct dml_stream_client_simple *dss;

	if (argc > 2)
		file = argv[2];
	if (argc < 2) {
		fprintf(stderr, "No id given\n");
		return -1;
	}
	if (argc > 3) {
		skip = atoi(argv[3]);
		fprintf(stderr, "Skip %zd bytes per packet\n", skip);
	}
	req_id_str = argv[1];

	if (dml_config_load(file)) {
		fprintf(stderr, "Failed to load config file %s\n", file);
		return -1;
	}
	ca = dml_config_value("ca", NULL, ".");
	server = dml_config_value("server", NULL, "localhost");
	
	if (dml_crypto_init(NULL, ca)) {
		fprintf(stderr, "Failed to init crypto\n");
		return -1;
	}

	dml_str_id(req_id, req_id_str);

	if (dml_str_id(req_id, req_id_str)) {
		dss = dml_stream_client_simple_search_create(server, NULL, req_id_str, NULL, NULL, NULL, data_cb, true);
	} else {
		dss = dml_stream_client_simple_create(server, req_id, NULL, data_cb, true);
	}

	if (!dss) {
		printf("Could not create stream\n");
		return -1;
	}

	dml_poll_loop();

	return 0;
}
