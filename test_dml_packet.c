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

#include <stdio.h>

#include <dml/dml_packet.h>

int g_r = 0;

void *dml_connection_send__dc;
uint8_t *dml_connection_send__data;
uint16_t dml_connection_send__id;
uint16_t dml_connection_send__len;
int dml_connection_send__r;

int dml_connection_send(struct dml_connection *dc, void *datav, uint16_t id, uint16_t len)
{
	dml_connection_send__dc = dc;
	dml_connection_send__data = malloc(len);
	memcpy(dml_connection_send__data, datav, len);
	dml_connection_send__id = id;
	dml_connection_send__len = len;
	return dml_connection_send__r;
}

int dml_crypto_sign(uint8_t sig[DML_SIG_SIZE], void *data, size_t len, struct dml_crypto_key *dk)
{
	return 0;
}

bool dml_crypto_verify(void *data, size_t len, uint8_t sig[DML_SIG_SIZE], struct dml_crypto_key *dk)
{
	return true;
}

#define TEST_START(name) \
	void  name(void) \
	{ \
		printf("Test " #name " :"); \
		int r = 0; \
		\
		dml_connection_send__dc = NULL; \
		dml_connection_send__data = NULL; \
		dml_connection_send__id = 0; \
		dml_connection_send__len = 0; \
		dml_connection_send__r = 0;

#define TEST_END() \
		if (dml_connection_send__data) \
			free(dml_connection_send__data); \
		printf(" %d %s\n", r, r ? "FAIL" : "PASS"); \
		g_r += r; \
	}

#define TEST_ASSERT(test, msg) \
	if (!(test)) {\
		printf("FAIL: " msg "\n"); \
		r++;\
	}

/***************************************************************************
	Tests
***************************************************************************/


TEST_START(test_hello)
	struct dml_connection *dc = (void*)1234;
	uint32_t flags = 0x12345678;
	char *ident = "Abcde";

	r = dml_packet_send_hello(dc, flags, ident);

	TEST_ASSERT(r == 0, "function reports error");
	TEST_ASSERT(dml_connection_send__len == 9, "wrong data length");
	TEST_ASSERT(dml_connection_send__data[0] == 0x12, "wrong data");
	TEST_ASSERT(dml_connection_send__data[1] == 0x34, "wrong data");
	TEST_ASSERT(dml_connection_send__data[2] == 0x56, "wrong data");
	TEST_ASSERT(dml_connection_send__data[3] == 0x78, "wrong data");

	uint32_t flags_p = 0;
	char *ident_p = NULL;
	r = dml_packet_parse_hello(dml_connection_send__data, dml_connection_send__len, &flags_p, &ident_p);

	TEST_ASSERT(r == 0, "function reports error");
	TEST_ASSERT(ident_p, "No ident");
	TEST_ASSERT(!strcmp(ident, ident_p), "Ident mismatch");
	TEST_ASSERT(flags_p == flags, "Flags do not match");

	free(ident_p);	
TEST_END()

TEST_START(test_update)
	struct dml_connection *dc = (void*)1234;
	uint32_t flags = 0x12345678;

	r = dml_packet_send_update(dc, flags);

	TEST_ASSERT(r == 0, "function reports error");
	TEST_ASSERT(dml_connection_send__len == 4, "wrong data length");
	TEST_ASSERT(dml_connection_send__data[0] == 0x12, "wrong data");
	TEST_ASSERT(dml_connection_send__data[1] == 0x34, "wrong data");
	TEST_ASSERT(dml_connection_send__data[2] == 0x56, "wrong data");
	TEST_ASSERT(dml_connection_send__data[3] == 0x78, "wrong data");

	uint32_t flags_p = 0;
	r = dml_packet_parse_update(dml_connection_send__data, dml_connection_send__len, &flags_p);

	TEST_ASSERT(r == 0, "function reports error");
	TEST_ASSERT(flags_p == flags, "Flags do not match");

TEST_END()



int main(int argc, char **argv)
{
	test_hello();
	test_update();

	return g_r;
}
