/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015, 2020

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
#include "dml_config.h"
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>

#include <glib.h>

struct dml_config {
	struct dml_config *next;
	
	char *key;
	char *value;
};

static struct dml_config *config_list = NULL;

static char *dml_config_file = "dml.conf";

static char *dml_config_default_path = NULL;

static void dml_config_default_init(void)
{
	const char *home = g_get_home_dir();
	
	asprintf(&dml_config_default_path, "%s/.dml/", home);
	printf("dml_config_default_path: %s\n", dml_config_default_path);
	mkdir(dml_config_default_path, 0700);
}

char *dml_config_path(void)
{
	if (!dml_config_default_path)
	{
		dml_config_default_init();
	}

	return dml_config_default_path;
}

static char *dml_config_default(void)
{
	if (!dml_config_default_path)
	{
		dml_config_default_init();
	}
	
	char *conf;
	asprintf(&conf, "%s/dml.conf", dml_config_default_path);
	printf("file: %s\n", conf);
	
	return conf;
}


int dml_config_add(char *key, char *value)
{
	struct dml_config *conf;
	
	conf = calloc(1, sizeof(struct dml_config));
	if (!conf)
		goto err_alloc;

	conf->key = strdup(key);
	if (!conf->key)
		goto err_key;
	conf->value = strdup(value);
	if (!conf->value)
		goto err_value;
			
	struct dml_config **entry;
			
	for (entry = &config_list; *entry; entry = &(*entry)->next);
	*entry = conf;
	
	return 0;
err_value:
	free(conf->key);
err_key:
	free(conf);
err_alloc:
	return -1;
}

int dml_config_load(char *file)
{
	FILE *fd;
	char *rf;
	
	if (!file)
		file = dml_config_default();
	
	dml_config_file = strdup(file);
	
	fd = fopen(file, "r");
	if (!fd)
		goto err_fopen;
	
	do {
		char buffer[1025];
		char *key, *value;
		
		rf = fgets(buffer, 1024, fd);
		while (strlen(buffer) && buffer[strlen(buffer)-1] == '\n')
			buffer[strlen(buffer)-1] = 0;
		key = strtok(buffer, " \t=");
		value = strtok(NULL, "\n\r");
		if (key && value) {
			while (value[0] == ' ' ||
			    value[0] == '\t' ||
			    value[0] == '=')
				value++;
			
			dml_config_add(key, value);
		}
	} while (rf);

	fclose(fd);

	return 0;

err_fopen:
	return -1;
}

int dml_config_save(char *file)
{
	FILE *fd;
	
	if (!file)
		file = dml_config_file;
	
	fd = fopen(file, "w");
	if (!fd)
		goto err_fopen;

	struct dml_config *entry;
	for (entry = config_list; entry; entry = entry->next) {
		fprintf(fd, "%s=%s\n", entry->key, entry->value);
	}

	fclose(fd);
	return 0;
	
err_fopen:
	return -1;
}


char *dml_config_value(char *key, char *prev_value, char *def)
{
	struct dml_config *entry;
	
	for (entry = config_list; entry; entry = entry->next) {
		if (prev_value && entry->value != prev_value)
			continue;
		if (prev_value) {
			prev_value = NULL;
			continue;
		}
		if (!strcmp(entry->key, key))
			return entry->value;
	}
	
	if (def)
		dml_config_add(key, def);
	
	return def;
}
