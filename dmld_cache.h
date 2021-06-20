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
#ifndef _INCLUDE_DMLD_CACHE_H_
#define _INCLUDE_DMLD_CACHE_H_

#include <dml/dml.h>


void dmld_cache_max_size_set(int max);
void dmld_cache_max_age_set(time_t age);

bool dmld_cache_search_header(uint8_t id[DML_ID_SIZE], uint8_t sig[DML_SIG_SIZE], void **header, size_t *header_size);
int dmld_cache_insert_header(uint8_t id[DML_ID_SIZE], uint8_t sig[DML_SIG_SIZE], void *header, size_t header_size);

bool dmld_cache_search_description(uint8_t id[DML_ID_SIZE], void **description, size_t *description_size);
int dmld_cache_insert_description(uint8_t id[DML_ID_SIZE], void *description, size_t description_size);

bool dmld_cache_search_certificate(uint8_t id[DML_ID_SIZE], void **certificate, size_t *certificate_size);
int dmld_cache_insert_certificate(uint8_t id[DML_ID_SIZE], void *certificate, size_t certificate_size);

int dmld_cache_delete(uint8_t id[DML_ID_SIZE]);


#endif // _INCLUDE_DMLD_CACHE_H_
