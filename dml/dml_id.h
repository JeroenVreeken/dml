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
#ifndef _INCLUDE_DML_ID_H_
#define _INCLUDE_DML_ID_H_

#include <dml/dml.h>

int dml_id_gen(uint8_t id[DML_ID_SIZE], uint8_t version, uint32_t bps,
    char *mime, char *name, char *alias, char *description);

char *dml_id_str(uint8_t id[DML_ID_SIZE]);
int dml_str_id(uint8_t id[DML_ID_SIZE], char *str);

#endif /* _INCLUDE_DML_ID_H_ */
