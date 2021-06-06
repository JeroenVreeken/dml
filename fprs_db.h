/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2016

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

#ifndef _INCLUDE_FPRS_DB_H_
#define _INCLUDE_FPRS_DB_H_

#include <time.h>
#include <stdbool.h>
#include <stdint.h>

#include <eth_ar/fprs.h>

struct fprs_db_id {
	enum fprs_type type;
	union {
		uint8_t callsign[6];
		char name[256];
		uint8_t data[256];
	} id;
	size_t id_size;
};

int fprs_db_element_set(struct fprs_db_id *id, 
    enum fprs_type type, 
    time_t t, time_t t_valid, 
    unsigned int link,
    uint8_t *data, size_t datasize);
int fprs_db_element_get(struct fprs_db_id *id, enum fprs_type type, time_t *t, uint8_t **data, size_t *datasize);
int fprs_db_element_del(struct fprs_db_id *id, enum fprs_type type);
unsigned int fprs_db_link_get(struct fprs_db_id *id);

int fprs_db_flush(time_t t);

#endif /* _INCLUDE_FPRS_DB_H_ */
