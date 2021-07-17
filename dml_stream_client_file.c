/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015 - 2017

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
#include <endian.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

static int fd_dump = -1;
static int last_hour = -1;
static char *dumpdir = "./";
static char *dumpfile = "dml_stream_dump";

static bool stddump = false;


static void *header = NULL;
static size_t header_size = 0;

char *suffix = "dump";

int duration = 0;
bool duration_start = false;


static gboolean duration_cb(void *arg)
{
	dml_log(DML_LOG_INFO, "Maximum duration reached\n");

	close(fd_dump);
	
	exit(0);
}	


static void header_cb(void *arg, void *data, size_t size)
{
	if (header) {
		free(header);
	}
	header = malloc(size);
	if (header) {
		header_size = size;
		memcpy(header, data, size);
	}
}

static int data_cb(void *arg, void *data, size_t datasize)
{
	time_t now = time(NULL);
	struct tm tm_now;

	if (duration && !duration_start) {
		dml_log(DML_LOG_INFO, "Maximum duration: %d seconds\n", duration);
		g_timeout_add_seconds(duration, duration_cb, NULL);
		duration_start = true;
	}
	
	gmtime_r(&now, &tm_now);
	if (!stddump && tm_now.tm_hour != last_hour) {
		if (fd_dump >= 0) {
			dml_log(DML_LOG_INFO, "Closing dump file\n");
			close(fd_dump);
		}
		
		char *dname;
		asprintf(&dname, "%s/%04d", dumpdir, tm_now.tm_year + 1900);
		mkdir(dname, 0777);
		free(dname);
		asprintf(&dname, "%s/%04d/%02d", dumpdir, tm_now.tm_year + 1900, tm_now.tm_mon + 1);
		mkdir(dname, 0777);
		free(dname);

		char *fname;
		asprintf(&fname, "%s/%04d/%02d/%s.%04d%02d%02d%02d00.%s",
		    dumpdir,
		    tm_now.tm_year + 1900, tm_now.tm_mon + 1,
		    dumpfile, 
		    tm_now.tm_year + 1900,
		    tm_now.tm_mon + 1, tm_now.tm_mday,
		    tm_now.tm_hour,
		    suffix);
		dml_log(DML_LOG_INFO, "Open new dump file: %s\n", fname);
		
		fd_dump = open(fname, O_WRONLY | O_CREAT | O_TRUNC, 
		    S_IRUSR | S_IWUSR | S_IRGRP | S_IROTH);
		free(fname);
		if (fd_dump < 0) {
			dml_log(DML_LOG_ERROR, "Failed to open dump file\n");
			return -1;
		}
		last_hour = tm_now.tm_hour;
		
		write(fd_dump, header, header_size);
	}


	if (write(fd_dump, data, datasize)) {
		return -1;
	}

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
	
	if (argc > 2) {
		if (!strcmp(argv[2], "-")) {
			stddump = true;
			fd_dump = 1;
		} else {
			file = argv[2];
		}
	}
	if (argc > 3)
		dumpfile = argv[3];
	if (argc > 4)
		dumpdir = argv[4];
	if (argc > 5)
		suffix = argv[5];
	if (argc > 6) {
		duration = atoi(argv[6]);
	}
	if (argc < 2) {
		dml_log(DML_LOG_ERROR, "No id given\n");
		return -1;
	}
	req_id_str = argv[1];

	if (dml_config_load(file)) {
		dml_log(DML_LOG_ERROR, "Failed to load config file %s\n", file);
		return -1;
	}
	ca = dml_config_value("ca", NULL, ".");
	server = dml_config_value("server", NULL, "localhost");
	
	if (dml_crypto_init(NULL, ca)) {
		dml_log(DML_LOG_ERROR, "Failed to init crypto\n");
		return -1;
	}

	if (dml_str_id(req_id, req_id_str)) {
		dml_log(DML_LOG_INFO, "Search for stream\n");
		dss = dml_stream_client_simple_search_create(server, NULL, req_id_str, NULL, NULL, NULL, data_cb, true);
	} else {
		dml_log(DML_LOG_INFO, "Use direct ID\n");
		dss = dml_stream_client_simple_create(server, req_id, NULL, data_cb, true);
	}
	if (!dss) {
		dml_log(DML_LOG_ERROR, "Could not create stream\n");
		return -1;
	}

	dml_stream_client_simple_set_cb_header(dss, NULL, header_cb);

	g_main_loop_run(g_main_loop_new(NULL, false));

	return 0;
}
