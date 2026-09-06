import 'package:dio/dio.dart';
import '../../app/di/injection.dart';
import '../utils/storage_util.dart';

class ApiInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await sl<StorageUtil>().getToken();
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }
}
