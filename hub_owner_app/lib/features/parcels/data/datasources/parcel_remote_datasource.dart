import '../../../../core/constants/api_constants.dart';
import '../../../../core/errors/exceptions.dart';
import '../../../../core/network/dio_client.dart';
import '../models/hub_parcel_model.dart';
abstract class HubParcelRemoteDataSource {
  Future<List<HubParcelModel>> getMyParcels();
  Future<HubParcelModel> receiveParcel(String trackingCode);
  Future<HubParcelModel> deliverParcel({required String parcelId, required String otp});
}
class HubParcelRemoteDataSourceImpl implements HubParcelRemoteDataSource {
  final DioClient dio;
  HubParcelRemoteDataSourceImpl(this.dio);
  @override Future<List<HubParcelModel>> getMyParcels() async {
    try {
      final res = await dio.dio.get(ApiConstants.myHubParcels);
      return (res.data['data'] as List).map((j) => HubParcelModel.fromJson(j)).toList();
    } catch (e) { throw ServerException(e.toString()); }
  }
  @override Future<HubParcelModel> receiveParcel(String trackingCode) async {
    try {
      final res = await dio.dio.post(ApiConstants.receiveParcel, data: {'tracking_code': trackingCode});
      return HubParcelModel.fromJson(res.data['data']);
    } catch (e) { throw ServerException(e.toString()); }
  }
  @override Future<HubParcelModel> deliverParcel({required String parcelId, required String otp}) async {
    try {
      final res = await dio.dio.post(ApiConstants.deliverParcel, data: {'parcel_id': parcelId, 'otp': otp});
      return HubParcelModel.fromJson(res.data['data']);
    } catch (e) { throw ServerException(e.toString()); }
  }
}
