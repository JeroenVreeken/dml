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
#ifndef _INCLUDE_DML_CONFIG_H_
#define _INCLUDE_DML_CONFIG_H_

#include <stdlib.h>

char *dml_config_path(void);

int dml_config_load(char *file);
int dml_config_save(char *file);

char *dml_config_value(char *key, char *prev_value, char *def);

/* set a (unique) value */
void dml_config_set(char *key, char *value);

#endif /* _INCLUDE_DML_CONFIG_H_ */
