from . import native_v1
import copy


apis = {
	"mlj_1":native_v1.api
}


def init_apis(server):

	for api in apis:
		apis[api].mount(server=server,path="apis/"+api)

		# backwards compatibility
		nativeapi = copy.deepcopy(apis["mlj_1"])
		nativeapi.mount(server=server,path="api")