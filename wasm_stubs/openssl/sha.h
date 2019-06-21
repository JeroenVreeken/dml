#ifndef _DML_WASM_STUB_SHA_H_
#define _DML_WASM_STUB_SHA_H_

#define SHA256_DIGEST_LENGTH 32

typedef struct {

} SHA256_CTX;

static inline int SHA256_Init(SHA256_CTX *c)
{
	return 0;
}

static inline int SHA256_Update(SHA256_CTX *c, const void *data, size_t len)
{
	return 0;
}

static inline int SHA256_Final(unsigned char *md, SHA256_CTX *c)
{
	return 0;
}

#endif /* _DML_WASM_STUB_SHA_H_ */
