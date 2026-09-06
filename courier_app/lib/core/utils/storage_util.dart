import 'package:flutter_secure_storage/flutter_secure_storage.dart';
class StorageUtil {
  final FlutterSecureStorage _s;
  StorageUtil(this._s);
  Future<void> saveToken(String t) => _s.write(key: 'token', value: t);
  Future<String?> getToken() => _s.read(key: 'token');
  Future<void> saveUserId(String id) => _s.write(key: 'uid', value: id);
  Future<void> clearAll() => _s.deleteAll();
}
