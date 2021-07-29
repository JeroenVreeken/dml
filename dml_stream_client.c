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
#define _GNU_SOURCE 

#include <dml/dml.h>
#include <dml/dml_id.h>
#include <dml/dml_crypto.h>
#include <dml/dml_log.h>
#include "dml_config.h"
#include "dml_stream_client_simple.h"

#include <stdlib.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>


static size_t skip = 0;
static bool verbose = true;


static int data_cb(void *arg, void *data, size_t datasize)
{
	if (datasize <= skip) {
		return 0;
	}
	size_t writesize = datasize - skip;
	
	if (write(1, data + skip, writesize) != writesize) {
		exit(-1);
	}
	
	return 0;
}

static void mime_cb(void *arg, char *mime){
	dml_log(DML_LOG_DEBUG, "mime: %s\n", mime);
}


gboolean maxtime_cb(void *arg)
{
	dml_log(DML_LOG_INFO, "Maximum time reached\n");
	exit(0);
}


int main(int argc, char **argv)
{
	char *file = "dml_stream_client.conf";
	char *ca;
	char *server;
	char *req_id_str;
	uint8_t req_id[DML_ID_SIZE];
	struct dml_stream_client_simple *dss;
	int maxtime = 0;

	if (argc > 2)
		file = argv[2];
	if (argc < 2) {
		dml_log(DML_LOG_ERROR, "No id given\n");
		return -1;
	}
	if (argc > 3) {
		maxtime = atoi(argv[3]);
	}
	req_id_str = argv[1];

	if (dml_config_load(file)) {
		dml_log(DML_LOG_ERROR, "Failed to load config file %s\n", file);
	}
	ca = dml_config_value("ca", NULL, ".");
	server = dml_config_value("server", NULL, "localhost");
	bool verify = atoi(dml_config_value("verify", NULL, "1"));
	verbose = atoi(dml_config_value("verbose", NULL, "1"));
	
	dml_log_fp(stderr);
	dml_log_level(verbose ? DML_LOG_DEBUG : DML_LOG_ERROR);
	
	if (dml_crypto_init(NULL, ca)) {
		dml_log(DML_LOG_ERROR, "Failed to init crypto\n");
		return -1;
	}

	dml_str_id(req_id, req_id_str);

	if (dml_str_id(req_id, req_id_str)) {
		dss = dml_stream_client_simple_search_create(server, NULL, req_id_str, NULL, NULL, NULL, data_cb, verify);
	} else {
		dss = dml_stream_client_simple_create(server, req_id, NULL, data_cb, verify);
	}

	if (!dss) {
		printf("Could not create stream\n");
		return -1;
	}
	
	dml_stream_client_simple_set_cb_mime(dss, dss, mime_cb);

	if (maxtime) {
		dml_log(DML_LOG_INFO, "Maximum time: %d seconds\n", maxtime);
		g_timeout_add_seconds(maxtime, maxtime_cb, NULL);
	}
	
	g_main_loop_run(g_main_loop_new(NULL, false));

	return 0;
}
